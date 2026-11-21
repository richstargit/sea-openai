"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveApiError, liveApi, type TranscriptionCreds, type Utterance } from "./api";
import { EMPTY_ITEMS, drainFinals, latestOpen, onCommitted, onFailed, onFinal, onPartial, toLines, type Items, type Line } from "./items";
import { scaleLevel, smoothLevel } from "./level";
import { EMPTY_SUGGESTIONS, applySuggestion, type SuggestionState } from "./suggestions";
import { FORCE_MOCK, createSource, isMockSession, type TranscriptionSource } from "./transcription";
import { complete, flush, newGate, offer, type Gate, type Step } from "./utterance-gate";

// One listening run: the microphone, the transcription, what is heard, and what to say next. Everything that touches the
// outside (microphone, socket, requests, timers) lives here; the decisions are the pure modules next to it.

export type ListenStatus = "idle" | "asking" | "connecting" | "listening" | "stopping";

const FAILED_BEFORE_HINT = 3;
const MIC = { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } as const;

type WakeLockLike = { release: () => Promise<void> };

function micMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "ไม่พบไมโครโฟน ลองต่อไมโครโฟนแล้วกดเริ่มฟังอีกครั้ง";
  if (name === "NotReadableError") return "ใช้ไมโครโฟนไม่ได้ อาจมีโปรแกรมอื่นกำลังใช้อยู่";
  return "ไม่ได้รับสิทธิ์ใช้ไมโครโฟน กรุณาอนุญาตไมโครโฟนในเบราว์เซอร์แล้วลองใหม่";
}

/** `enabled`: a live script is ready to listen to. `keyboard`: the space bar may start and stop (only after the seller has agreed to the microphone notice). */
export function useListening(options: { showId: string; enabled: boolean; keyboard: boolean }) {
  const { showId, enabled, keyboard } = options;
  const [status, setStatus] = useState<ListenStatus>("idle");
  const [reconnecting, setReconnecting] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionState>(EMPTY_SUGGESTIONS);
  const [pending, setPending] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [showOnStream, setShowOnStreamState] = useState(false);
  const [prompterUrl, setPrompterUrl] = useState<string | null>(null);

  // The mutable side of a run. `run` is bumped when a run ends, so a late answer from an older run is ignored.
  const run = useRef(0);
  const statusRef = useRef<ListenStatus>("idle");
  const session = useRef<string | null>(null);
  const source = useRef<TranscriptionSource | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const items = useRef<Items>(EMPTY_ITEMS);
  const gate = useRef<Gate>(newGate());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failures = useRef(0);
  const smoothed = useRef(0);
  const mock = useRef(false);
  const wake = useRef<WakeLockLike | null>(null);
  const onStream = useRef(false);
  // apply and dispatch call each other (a finished request lets the next waiting one go), so each reaches the other here.
  const engine = useRef<{ apply: (step: Step) => void; dispatch: (utterance: Utterance) => void }>({ apply: () => undefined, dispatch: () => undefined });

  const setStatusBoth = (next: ListenStatus) => { statusRef.current = next; setStatus(next); };

  const pushLevel = useCallback((rms: number) => {
    smoothed.current = smoothLevel(smoothed.current, scaleLevel(rms));
    const rounded = Math.round(smoothed.current * 50) / 50;
    setLevel((previous) => (previous === rounded ? previous : rounded));
  }, []);

  const releaseWake = useCallback(() => {
    const lock = wake.current;
    wake.current = null;
    if (lock) void lock.release().catch(() => undefined);
  }, []);

  const requestWake = useCallback(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> } }).wakeLock;
    if (!api || wake.current) return;
    api.request("screen").then((lock) => { wake.current = lock; }).catch(() => undefined);
  }, []);

  /** Everything that belongs to one run is let go here, whichever way the run ended. */
  const release = useCallback(async () => {
    run.current += 1; // answers still on their way belong to the run that is over
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    const current = source.current;
    source.current = null;
    if (current) await current.stop().catch(() => undefined);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    const id = session.current;
    session.current = null;
    if (id) void liveApi.stopSession(id).catch(() => undefined);
    releaseWake();
    gate.current = newGate();
    smoothed.current = 0;
    setLevel(0);
    setPending(false);
    setReconnecting(false);
  }, [releaseWake]);

  /** The run ended by itself (the connection could not be kept, the session is gone). */
  const fail = useCallback(async (message: string) => {
    setError(message);
    setStatusBoth("stopping");
    await release();
    setStatusBoth("idle");
  }, [release]);

  // ---- what leaves the browser -------------------------------------------------------------------------------------
  const apply = useCallback((step: Step) => {
    gate.current = step.gate;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = null;
    if (step.send) engine.current.dispatch(step.send);
    if (step.flushAt !== null) {
      flushTimer.current = setTimeout(() => engine.current.apply(flush(gate.current, Date.now())), Math.max(0, step.flushAt - Date.now()));
    }
    setPending(step.gate.inFlight);
  }, []);

  const dispatch = useCallback((utterance: Utterance) => {
    const mine = run.current;
    const id = session.current;
    if (!id) return;
    liveApi.sendUtterance(id, utterance)
      .then((suggestion) => {
        if (run.current !== mine) return;
        failures.current = 0;
        setHint(null);
        setSuggestions((state) => applySuggestion(state, suggestion));
      })
      .catch((problem: unknown) => {
        if (run.current !== mine) return;
        if (problem instanceof LiveApiError && (problem.status === 401 || problem.status === 404 || problem.status === 410)) {
          void fail(problem.status === 401 ? problem.message : "การฟังหมดอายุแล้ว กดเริ่มฟังใหม่อีกครั้ง");
          return;
        }
        failures.current += 1;
        if (failures.current >= FAILED_BEFORE_HINT) setHint("ส่งข้อความที่ได้ยินไปไม่สำเร็จ กำลังลองใหม่ต่อไป");
      })
      .finally(() => {
        if (run.current !== mine) return;
        engine.current.apply(complete(gate.current, Date.now()));
      });
  }, [fail]);

  useEffect(() => { engine.current = { apply, dispatch }; }, [apply, dispatch]);

  const offerUtterance = useCallback((utterance: Utterance) => apply(offer(gate.current, utterance, Date.now())), [apply]);

  // ---- what comes back from the transcription ----------------------------------------------------------------------
  const settle = useCallback((next: Items, partialId?: string) => {
    const drained = drainFinals(next);
    items.current = drained.items;
    setLines(toLines(drained.items));
    for (const final of drained.finals) offerUtterance({ text: final.text, final: true, tsMs: final.committedAt });
    if (drained.finals.length === 0 && partialId) {
      const open = latestOpen(drained.items);
      if (open && open.id === partialId) offerUtterance({ text: open.text, final: false, tsMs: open.committedAt });
    }
  }, [offerUtterance]);

  const start = useCallback(async () => {
    if (statusRef.current !== "idle" || !enabled) return;
    const mine = ++run.current;
    setError(null);
    setHint(null);
    failures.current = 0;
    items.current = EMPTY_ITEMS;
    gate.current = newGate();
    setLines([]);
    setSuggestions(EMPTY_SUGGESTIONS);

    // The microphone first, while the click is fresh, so the browser lets the audio start.
    setStatusBoth("asking");
    let mic: MediaStream | null = null;
    if (!FORCE_MOCK) {
      try {
        mic = await navigator.mediaDevices.getUserMedia({ audio: MIC });
      } catch (problem) {
        if (run.current === mine) { setError(micMessage(problem)); setStatusBoth("idle"); }
        return;
      }
      if (run.current !== mine) { mic.getTracks().forEach((track) => track.stop()); return; }
    }
    stream.current = mic;

    setStatusBoth("connecting");
    let creds: TranscriptionCreds;
    let id: string;
    try {
      const started = await liveApi.startSession(showId, { showOnStream: onStream.current });
      id = started.sessionId;
      creds = started.transcription;
      if (run.current === mine) setPrompterUrl(started.prompterUrl ?? null);
      if (run.current !== mine) { void liveApi.stopSession(id).catch(() => undefined); mic?.getTracks().forEach((track) => track.stop()); return; }
    } catch (problem) {
      mic?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (run.current === mine) { setError(problem instanceof Error ? problem.message : "เริ่มฟังไม่สำเร็จ"); setStatusBoth("idle"); }
      return;
    }
    session.current = id;
    mock.current = isMockSession(creds);

    const guard = <A extends unknown[]>(handler: (...args: A) => void) => (...args: A) => { if (run.current === mine) handler(...args); };
    try {
      const created = createSource({
        creds,
        stream: mic,
        refreshSecret: () => liveApi.refreshSecret(id),
        handlers: {
          onCommitted: guard((itemId, tsMs) => settle(onCommitted(items.current, itemId, tsMs))),
          onResult: guard((result) => {
            if (mock.current) pushLevel(0.12);
            const next = result.final
              ? onFinal(items.current, result.id, result.text, result.tsMs)
              : onPartial(items.current, result.id, result.text, result.tsMs, result.mode);
            settle(next, result.final ? undefined : result.id);
          }),
          onFailed: guard((itemId) => settle(onFailed(items.current, itemId))),
          onLevel: guard(pushLevel),
          onState: guard((state) => setReconnecting(state === "reconnecting")),
          onError: guard((message) => { void fail(message || "การฟังหยุดลง ลองกดเริ่มฟังอีกครั้ง"); }),
          onClose: guard(() => { if (statusRef.current === "listening") void fail("การฟังหยุดลง ลองกดเริ่มฟังอีกครั้ง"); }),
        },
      });
      source.current = created;
      await created.start();
    } catch (problem) {
      if (run.current === mine) await fail(problem instanceof Error && problem.message ? problem.message : "เริ่มฟังไม่สำเร็จ");
      return;
    }
    if (run.current !== mine) return;
    setStatusBoth("listening");
    requestWake();
  }, [enabled, showId, settle, pushLevel, fail, requestWake]);

  const stop = useCallback(async () => {
    if (statusRef.current === "idle" || statusRef.current === "stopping") return;
    setStatusBoth("stopping");
    await release();
    setStatusBoth("idle");
  }, [release]);

  const toggle = useCallback(() => { void (statusRef.current === "idle" ? start() : stop()); }, [start, stop]);

  const setShowOnStream = useCallback((value: boolean) => {
    onStream.current = value;
    setShowOnStreamState(value);
    const id = session.current;
    if (!id) return;
    liveApi.setShowOnStream(id, value).catch(() => {
      onStream.current = !value;
      setShowOnStreamState(!value);
      setHint("เปลี่ยนการแสดงบนสตรีมไม่สำเร็จ ลองอีกครั้ง");
    });
  }, []);

  // The space bar starts and stops listening, as long as the seller is not typing or pressing a control.
  useEffect(() => {
    if (!enabled || !keyboard) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, a, summary, [contenteditable=''], [contenteditable='true']")) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, keyboard, toggle]);

  // The screen lock is dropped when the tab is hidden, so it is asked for again when the tab comes back.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible" && statusRef.current === "listening") requestWake(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWake]);

  // Leaving the page ends listening: the microphone is let go and the session is closed.
  useEffect(() => () => { void release(); }, [release]);

  return {
    status, listening: status === "listening", busy: status === "asking" || status === "connecting" || status === "stopping",
    reconnecting, lines, suggestions, pending, level, error, hint, showOnStream, prompterUrl,
    start, stop, toggle, setShowOnStream, clearError: () => setError(null),
  };
}
