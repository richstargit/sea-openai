"use client";

import { useEffect, useRef, useState } from "react";
import { studioPost, studioRequest } from "../components/studio/studio-api";

export type SpeechProduct = { id: string; name: string; price: number };
export type LiveSentence = {
  raw: string;
  corrected: string;
  productId: string | null;
  price: number | null;
  from: number | null;
  to: number | null;
  left: number | null;
  code: string | null;
  intent: string;
  combo: { main: string | null; accent: string | null; caption: string | null } | null;
  source: "openai" | "browser";
};
export type LiveSpeechOptions = {
  enabled: boolean;
  lang: "th" | "en";
  products: SpeechProduct[];
  current: string | null;
  motions?: { main: { id: string; description: string }[]; accent: { id: string; description: string }[] };
  onSentence: (s: LiveSentence) => void;
};
export type LiveSpeechStatus = "off" | "listening" | "error" | "unsupported";

// Tunables
export const SPEECH_CFG = {
  threshold: 0.015, // min RMS counted as voice (also raised to 2.5x the noise floor)
  silenceMs: 600, // silence after speech that ends a segment
  maxMs: 5000, // hard cap per segment
  minVoiceFrames: 4, // voiced ticks (~200 ms) required, else segment is skipped
  tickMs: 50,
  prerollMs: 400, // idle recorder rotation, so a segment starts up to this early
  maxInflight: 2,
  failFallback: 2, // consecutive OpenAI errors before browser results are emitted
  hintMax: 400,
};

// ---- pure helpers ----
export function rms(samples: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return samples.length ? Math.sqrt(s / samples.length) : 0;
}

export type VadState = { speaking: boolean; startedAt: number; lastVoiceAt: number; voiced: number };
export type VadAction = "start" | "send" | "discard" | null;
export const VAD_IDLE: VadState = { speaking: false, startedAt: 0, lastVoiceAt: 0, voiced: 0 };

export function vadStep(s: VadState, level: number, now: number, cfg = SPEECH_CFG, threshold = cfg.threshold): [VadState, VadAction] {
  const voice = level >= threshold;
  if (!s.speaking) return voice ? [{ speaking: true, startedAt: now, lastVoiceAt: now, voiced: 1 }, "start"] : [s, null];
  const n = voice ? { ...s, lastVoiceAt: now, voiced: s.voiced + 1 } : s;
  if (now - n.lastVoiceAt >= cfg.silenceMs || now - n.startedAt >= cfg.maxMs) {
    return [VAD_IDLE, n.voiced >= cfg.minVoiceFrames ? "send" : "discard"];
  }
  return [n, null];
}

/** Product names (+ "CF <id>" codes) joined for the transcriber, capped at max chars on item boundaries. */
export function buildHint(products: { id: string; name: string }[], max = SPEECH_CFG.hintMax): string {
  let out = "";
  for (const p of products) {
    const item = `${p.name} CF ${p.id}`;
    const next = out ? `${out}, ${item}` : item;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

export function pickMimeType(isSupported: (t: string) => boolean): string | undefined {
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(isSupported);
}

// ---- hook ----
type Understood = Partial<Omit<LiveSentence, "raw" | "source">> & { latencyMs?: number };
type SR = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null;
  start(): void; abort(): void;
};

export function useLiveSpeech(options: LiveSpeechOptions) {
  const { enabled, lang } = options;
  const opt = useRef(options);
  opt.current = options;
  const [status, setStatus] = useState<LiveSpeechStatus>("off");
  const [interim, setInterim] = useState("");
  const [level, setLevel] = useState(0);
  const [lastLatencyMs, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setStatus("off"); setInterim(""); setLevel(0); return; }
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.getUserMedia || typeof MediaRecorder === "undefined") { setStatus("unsupported"); return; }

    let alive = true;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let tick: ReturnType<typeof setInterval> | undefined;
    let restart: ReturnType<typeof setTimeout> | undefined;
    let recog: SR | null = null;
    let rec: { mr: MediaRecorder; keep: boolean; startedAt: number } | null = null;
    const ctrl = new AbortController();
    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    let seq = 0, emitted = 0, inflight = 0, fails = 0, lastLevel = 0, floor = 0.005;
    let vad = VAD_IDLE;

    const understand = async (text: string) => {
      const o = opt.current;
      try {
        return await studioPost<Understood>("/agent/live/understand", {
          text, products: o.products.map(({ id, name, price }) => ({ id, name, price })), current: o.current, lang: o.lang,
          ...(o.motions ? { motions: o.motions } : {}),
        });
      } catch { return {} as Understood; }
    };
    const emit = (n: number, raw: string, u: Understood, source: LiveSentence["source"], ms: number | null) => {
      if (!alive || n < emitted) return; // late result for an older segment
      emitted = n;
      if (ms != null) setLatency(ms);
      setInterim("");
      opt.current.onSentence({
        raw, corrected: u.corrected || raw, productId: u.productId ?? null, price: u.price ?? null,
        from: u.from ?? null, to: u.to ?? null, left: u.left ?? null, code: u.code ?? null, intent: u.intent || "none", combo: u.combo ?? null, source,
      });
    };

    const submit = async (blob: Blob) => {
      if (inflight >= SPEECH_CFG.maxInflight) return; // shortcut: drops the segment instead of queueing, upgrade if drops show up
      const n = ++seq;
      inflight++;
      const t0 = performance.now();
      try {
        const hint = buildHint(opt.current.products);
        const t = await studioRequest<{ text: string; latencyMs?: number }>(
          `/agent/live/transcribe?lang=${opt.current.lang}&hint=${encodeURIComponent(hint)}`,
          { method: "POST", headers: { "Content-Type": blob.type }, body: blob, signal: ctrl.signal },
        );
        fails = 0; setError(null);
        const raw = (t.text || "").trim();
        if (!raw) return;
        const u = await understand(raw);
        emit(n, raw, u, "openai", Math.round(performance.now() - t0));
      } catch {
        if (alive) { fails++; if (fails >= SPEECH_CFG.failFallback) setError("OpenAI transcription failing, using browser speech"); }
      } finally { inflight--; }
    };

    const startRec = () => {
      if (!alive || !stream) return;
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const r = { mr, keep: false, startedAt: performance.now() };
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = () => { if (r.keep && alive) void submit(new Blob(chunks, { type: mr.mimeType || mimeType || "audio/webm" })); };
      mr.start(); // no timeslice: each segment is a standalone file
      rec = r;
    };
    const endRec = (keep: boolean) => {
      const r = rec; if (!r) return;
      r.keep = keep;
      try { r.mr.stop(); } catch { /* already stopped */ }
      startRec();
    };

    const startRecog = () => {
      const w = window as any;
      const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
      if (!Ctor) return;
      const r: SR = new Ctor();
      recog = r;
      r.lang = lang === "th" ? "th-TH" : "en-US";
      r.continuous = true;
      r.interimResults = true;
      r.onresult = (e) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text: string = e.results[i][0].transcript.trim();
          if (!e.results[i].isFinal) { live += text; continue; }
          if (fails >= SPEECH_CFG.failFallback && text) {
            const n = ++seq;
            void understand(text).then((u) => emit(n, text, u, "browser", null));
          }
        }
        if (alive) setInterim(live);
      };
      r.onerror = (e) => { if (e?.error === "not-allowed" || e?.error === "service-not-allowed") recog = null; };
      r.onend = () => { if (alive && recog === r) restart = setTimeout(() => { if (alive && recog === r) try { r.start(); } catch { /* busy */ } }, 250); };
      try { r.start(); } catch { /* ignore */ }
    };

    (async () => {
      try {
        stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        if (!alive) { stream.getTracks().forEach((t) => t.stop()); return; }
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        setStatus("listening"); setError(null);
        startRec();
        startRecog();
        tick = setInterval(() => {
          an.getFloatTimeDomainData(buf);
          const v = rms(buf);
          if (!vad.speaking) floor = floor * 0.95 + Math.min(v, 0.05) * 0.05;
          const l = Math.min(1, v * 6);
          if (Math.abs(l - lastLevel) > 0.02) { lastLevel = l; setLevel(l); }
          const now = performance.now();
          const [next, action] = vadStep(vad, v, now, SPEECH_CFG, Math.max(SPEECH_CFG.threshold, floor * 2.5));
          vad = next;
          if (action === "send" || action === "discard") endRec(action === "send");
          else if (!vad.speaking && rec && now - rec.startedAt >= SPEECH_CFG.prerollMs) endRec(false);
        }, SPEECH_CFG.tickMs);
      } catch (e) {
        if (alive) { setStatus("error"); setError(e instanceof Error ? e.message : "Microphone unavailable"); }
      }
    })();

    return () => {
      alive = false;
      ctrl.abort();
      clearInterval(tick); clearTimeout(restart);
      const r = recog; recog = null;
      try { r?.abort(); } catch { /* ignore */ }
      try { rec?.mr.stop(); } catch { /* ignore */ }
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close().catch(() => {});
      setStatus("off"); setInterim(""); setLevel(0);
    };
  }, [enabled, lang]);

  return { status, interim, level, lastLatencyMs, error };
}
