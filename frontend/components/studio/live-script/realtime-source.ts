import type { TranscriptionCreds } from "./api";
import { toBase64 } from "./pcm";
import { decodeServerEvent, isAuthError, isBenignError } from "./realtime-events";
import { nextRetry, secretExpired, switchDecision } from "./reconnect";
import type { SourceHandlers, TranscriptionSource } from "./source-types";

// The real connection to the live transcription, kept behind the adapter in transcription.ts so it can be replaced
// (for example by a backend proxy) without touching the panel. The microphone is processed in an AudioWorklet
// (public/studio/live-mic-worklet.js, tested on its own), the audio goes over a WebSocket opened with the short lived
// secret the backend gave, and results come back as events keyed by item id.
//
// The way to open the socket (a "realtime" subprotocol plus the secret as a second protocol) comes from research and is
// not yet confirmed against the live service. It lives in `openSocket` below, the only place that would change.

const WORKLET_URL = "/studio/live-mic-worklet.js";
/** About 30 seconds of 200 ms chunks can wait for a socket without losing the start of what is being said. */
const MAX_QUEUED = 150;
const ROTATION_CHECK_MS = 20_000;
const FLUSH_ON_STOP_MS = 200;

type WorkletMessage =
  | { type: "audio"; buffer: ArrayBuffer }
  | { type: "commit"; reason: string }
  | { type: "speaking"; value: boolean }
  | { type: "level"; value: number };

type AudioContextCtor = typeof AudioContext;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createRealtimeSource({ creds, stream, handlers, refreshSecret }: {
  creds: TranscriptionCreds;
  stream: MediaStream;
  handlers: SourceHandlers;
  /** Asks the backend for a fresh secret (POST /sessions/:id/secret). */
  refreshSecret: () => Promise<TranscriptionCreds>;
}): TranscriptionSource {
  let context: AudioContext | null = null;
  let worklet: AudioWorkletNode | null = null;
  let mic: MediaStreamAudioSourceNode | null = null;
  let silent: GainNode | null = null;
  let socket: WebSocket | null = null;
  let ready = false;
  let openedAt = 0;
  let stopped = false;
  let reconnecting = false;
  let current = creds;
  let needFresh = false;
  let speaking = false;
  let rotation: ReturnType<typeof setInterval> | null = null;
  const startedAt = Date.now();
  const queue: string[] = [];
  const waiting = new Set<string>();
  const sinceStart = () => Date.now() - startedAt;

  function send(message: object) {
    const text = JSON.stringify(message);
    if (socket && ready && socket.readyState === WebSocket.OPEN) { socket.send(text); return; }
    queue.push(text);
    // Past the limit the oldest audio is dropped, but the newest speech is always kept.
    while (queue.length > MAX_QUEUED) queue.shift();
  }

  function flushQueue() {
    while (queue.length && socket && ready && socket.readyState === WebSocket.OPEN) socket.send(queue.shift() as string);
  }

  /** The only place that knows how the socket is opened. */
  function openSocket(c: TranscriptionCreds): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(c.url, ["realtime", `openai-insecure-api-key.${c.clientSecret}`]);
      ws.onopen = () => {
        // The settings are sent exactly as the backend returned them.
        if (c.sessionUpdate) ws.send(JSON.stringify({ type: "session.update", session: c.sessionUpdate }));
        settled = true;
        resolve(ws);
      };
      ws.onerror = () => { if (!settled) { settled = true; reject(new Error("socket")); } };
      ws.onclose = () => { if (!settled) { settled = true; reject(new Error("closed")); } };
    });
  }

  function adopt(ws: WebSocket) {
    const old = socket;
    socket = ws;
    ready = true;
    openedAt = Date.now();
    ws.onmessage = (event) => { if (ws === socket && typeof event.data === "string") onServerEvent(event.data); };
    ws.onclose = () => { if (ws === socket && !stopped) lost(); };
    ws.onerror = () => undefined;
    if (old) { old.onclose = null; old.onmessage = null; old.close(); }
    flushQueue();
  }

  function onServerEvent(raw: string) {
    const event = decodeServerEvent(raw);
    switch (event.kind) {
      case "committed":
        waiting.add(event.itemId);
        handlers.onCommitted(event.itemId, sinceStart());
        break;
      case "partial":
        handlers.onResult({ id: event.itemId, text: event.text, final: false, tsMs: sinceStart(), mode: event.replace ? "replace" : "append" });
        break;
      case "final":
        waiting.delete(event.itemId);
        handlers.onResult({ id: event.itemId, text: event.text, final: true, tsMs: sinceStart() });
        break;
      case "failed":
        waiting.delete(event.itemId);
        handlers.onFailed(event.itemId);
        break;
      case "error":
        if (isBenignError(event.code, event.message)) break;
        if (isAuthError(event.code, event.message)) { needFresh = true; socket?.close(); }
        break;
      default:
        break;
    }
  }

  /** The connection dropped. Whatever was still being transcribed is gone, so those items must not hold back the others. */
  function lost() {
    ready = false;
    for (const id of waiting) handlers.onFailed(id);
    waiting.clear();
    void reconnect();
  }

  async function reconnect() {
    if (stopped || reconnecting) return;
    reconnecting = true;
    handlers.onState?.("reconnecting");
    for (let attempt = 0; !stopped; attempt++) {
      const step = nextRetry(attempt);
      if (step.giveUp) {
        reconnecting = false;
        handlers.onError("การถอดเสียงขาดการเชื่อมต่อ กดเริ่มฟังใหม่ได้เลย");
        return;
      }
      await sleep(step.delayMs);
      if (stopped) break;
      try {
        if (needFresh || secretExpired(current.expiresAt, Date.now())) { current = await refreshSecret(); needFresh = false; }
        adopt(await openSocket(current));
        handlers.onState?.("listening");
        break;
      } catch {
        // A secret that failed once is not tried again: the next round asks for a new one.
        needFresh = true;
      }
    }
    reconnecting = false;
  }

  /** Replace the socket before its time limit, at the end of an utterance, with the audio still flowing to the old one meanwhile. */
  async function rotateIfDue() {
    if (stopped || reconnecting || !ready) return;
    const decision = switchDecision({ openedAt, now: Date.now(), speaking, awaiting: waiting.size });
    if (decision !== "switch") return;
    reconnecting = true;
    try {
      current = await refreshSecret();
      adopt(await openSocket(current));
    } catch {
      // The old connection is still there; the next check tries again.
    } finally {
      reconnecting = false;
    }
  }

  function onWorklet(message: WorkletMessage) {
    switch (message.type) {
      case "audio": send({ type: "input_audio_buffer.append", audio: toBase64(message.buffer) }); break;
      case "commit": send({ type: "input_audio_buffer.commit" }); break;
      case "speaking": speaking = message.value; break;
      case "level": handlers.onLevel?.(message.value); break;
    }
  }

  async function start() {
    handlers.onState?.("connecting");
    const Ctor: AudioContextCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) throw new Error("เบราว์เซอร์นี้ไม่รองรับการฟังเสียง");
    context = new Ctor({ latencyHint: "interactive" });
    // A page that was never clicked leaves the audio context suspended; this start comes from a click.
    await context.resume();
    if (!context.audioWorklet) throw new Error("เบราว์เซอร์นี้ไม่รองรับการฟังเสียง");
    await context.audioWorklet.addModule(WORKLET_URL);
    worklet = new AudioWorkletNode(context, "live-mic", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { silenceMs: current.vad?.silenceMs ?? 700, maxUtteranceMs: 15_000 },
    });
    worklet.port.onmessage = (event: MessageEvent<WorkletMessage>) => onWorklet(event.data);
    mic = context.createMediaStreamSource(stream);
    silent = context.createGain();
    silent.gain.value = 0;
    // The node is pulled by the audio graph only when it leads to the output, so it goes there through a muted gain.
    mic.connect(worklet);
    worklet.connect(silent);
    silent.connect(context.destination);

    // The first connection must work, or listening cannot begin; later drops reconnect by themselves.
    adopt(await openSocket(current));
    rotation = setInterval(() => void rotateIfDue(), ROTATION_CHECK_MS);
    handlers.onState?.("listening");
  }

  async function stop() {
    if (stopped) return;
    // An utterance in progress is committed and its audio given a moment to reach the socket before it closes.
    worklet?.port.postMessage({ type: "finish" });
    await sleep(FLUSH_ON_STOP_MS);
    stopped = true;
    if (rotation) clearInterval(rotation);
    queue.length = 0;
    waiting.clear();
    if (socket) { socket.onclose = null; socket.onmessage = null; socket.close(); socket = null; }
    ready = false;
    try { mic?.disconnect(); worklet?.disconnect(); silent?.disconnect(); } catch { /* already disconnected */ }
    if (worklet) worklet.port.onmessage = null;
    try { await context?.close(); } catch { /* already closed */ }
  }

  return { start, stop };
}
