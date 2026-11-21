"use client";

// Built-in realtime detection for the control room (no iframe): frames from the control room's own <video>,
// product + action decisions from the Decisions API (/agent/live/decide), the product box from
// /agent/live/locate, and box tracking in the browser between locates.
// The pacing, confirmation rules and tracker are adapted from the demo detector (demo/public/live.js).
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { director } from "@/lib/live-plan";
import type { Decision, LiveProduct } from "@/lib/live-plan";
import { studioPost } from "@/components/studio/studio-api";

/** A box in fractions of the video frame (0–1), as the camera sees it (not mirrored). */
export type DetectBox = { x: number; y: number; w: number; h: number };

export type DetectState = {
  running: boolean;
  /** CF code of the product currently confirmed on camera, or null. */
  product: string | null;
  confidence: number | null;
  heldUp: number | null;
  /** Tracked box of `product`, updated ~10×/s while tracking; null when unknown. */
  box: DetectBox | null;
  lastDecision: Decision | null;
  /** Round trip of the last decide call. */
  latencyMs: number | null;
  error: string | null;
};

export type DetectOptions = {
  video: RefObject<HTMLVideoElement | null>;
  enabled: boolean;
  products: LiveProduct[];
  /** Last ~10 s of what the host said. */
  transcript: () => string;
  /** Name of the product the run-of-show is on now. */
  current: string | null;
  /** Presets the Decisions API may pick for this moment (kit moments first). */
  motions?: { id: string; description: string }[];
  /** Every decision as it arrives (the control room acts on it). */
  onDecision?: (decision: Decision) => void;
};

export const idleDetect: DetectState = { running: false, product: null, confidence: null, heldUp: null, box: null, lastDecision: null, latencyMs: null, error: null };

// ---------- tunables ----------
const TICK_MS = 60; // main loop
const WATCH_MS = 120; // motion probe on a 32×18 thumbnail
const TRACK_MS = 100; // tracker step + box update (~10×/s)
const MIN_GAP_MS = 1000; // between decide calls (one in flight at a time)
const SPEECH_GAP_MS = 2500; // a still picture is re-asked this often only when the transcript moved on
const SETTLE_MS = 450; // the picture must hold still this long before a "change" call…
const CHANGE_WAIT_MS = 2500; // …or the change is sent anyway after this
const CUT = 12; // mean grey difference that counts as a hard cut (new scene)
const CHANGE = 6; // …as a change worth a new decision
const STILL = 2.5; // …as "not moving"
const SURE = 0.9; // one result this confident confirms a product
const SURE_AFTER_CUT = 0.7;
const LOCATE_GAP_MS = 2500; // never more than one locate per this
const REANCHOR_MS = 8000; // fresh locate while tracking, even when the track looks fine
const DECIDE_PX = 512;
const LOCATE_PX = 1024;
const TW = 240; // tracker image width
const GOOD = 26; // tracker match cost below this is a hit

// ---------- pure helpers (tested in tests/live-detect.test.mjs) ----------
export type Rect = { x: number; y: number; w: number; h: number };
export type Grey = { g: Uint8Array; w: number; h: number };

/** RGBA → grey (0.3 R + 0.6 G + 0.1 B), n pixels. */
export function luma(px: ArrayLike<number>, n: number) {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
  return g;
}

/** Mean absolute difference of two signatures; 255 when one is missing. */
export function difference(a: Uint8Array | null, b: Uint8Array | null) {
  if (!a || !b) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** OBS often letterboxes the camera inside a black canvas: the picture area of a w×h frame, from a pw×ph RGBA probe. */
export function contentRect(px: ArrayLike<number>, pw: number, ph: number, w: number, h: number): Rect {
  let left = pw, right = -1, top = ph, bottom = -1;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const i = (y * pw + x) * 4;
    if (Math.max(px[i], px[i + 1], px[i + 2]) > 22) {
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  const full = { x: 0, y: 0, w, h };
  if (right < left || bottom < top) return full;
  const sx = w / pw, sy = h / ph;
  const x = Math.max(0, (left - 1) * sx), y = Math.max(0, (top - 1) * sy);
  const rect = { x, y, w: Math.min(w, (right + 2) * sx) - x, h: Math.min(h, (bottom + 2) * sy) - y };
  // Only crop real borders; a dark background inside a full picture must not shrink the frame.
  return rect.w * rect.h < w * h * 0.85 ? rect : full;
}

export type Stabilizer = { candidate: string | null; count: number; confirmed: string | null; noneStreak: number; needVote: boolean };
export const freshStabilizer = (): Stabilizer => ({ candidate: null, count: 0, confirmed: null, noneStreak: 0, needVote: false });

/** Confirm after two agreeing results or one confident one; clear after two "none" (three while the tracker still holds it). */
export function stabilize(s: Stabilizer, product: string | null, confidence: number | null, cut: boolean, tracked: boolean): Stabilizer {
  const id = product && product !== "none" ? product : null;
  const count = s.candidate === id ? s.count + 1 : 1;
  if (!id) {
    const noneStreak = s.noneStreak + 1;
    const clear = noneStreak >= (tracked ? 3 : 2);
    // A blurry moving frame can say "none" while the product is still there: take another look before clearing.
    return { candidate: null, count, confirmed: clear ? null : s.confirmed, noneStreak, needVote: !clear && s.confirmed !== null };
  }
  const sure = count >= 2 || (confidence ?? 0) >= (cut ? SURE_AFTER_CUT : SURE);
  return { candidate: id, count, confirmed: sure ? id : s.confirmed, noneStreak: 0, needVote: !sure };
}

// Box tracker: a 20×20 grid of grey samples of the located product, followed with a sum-of-absolute-differences
// search over position and a little scale. (x, y) is the box centre in tracker pixels; samples are offsets from it.
export type Tracker = { samples: Float32Array; values: Float32Array; x: number; y: number; scale: number; w: number; h: number; lost: number; cost: number };

export function makeTracker(img: Grey, box: DetectBox): Tracker {
  const bw = Math.max(4, box.w * img.w), bh = Math.max(4, box.h * img.h);
  const cx = (box.x + box.w / 2) * img.w, cy = (box.y + box.h / 2) * img.h;
  const n = 20, samples: number[] = [], values: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = ((i + 0.5) / n - 0.5) * bw, dy = ((j + 0.5) / n - 0.5) * bh;
    const x = Math.round(cx + dx), y = Math.round(cy + dy);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
    samples.push(dx, dy);
    values.push(img.g[y * img.w + x]);
  }
  return { samples: Float32Array.from(samples), values: Float32Array.from(values), x: Math.round(cx), y: Math.round(cy), scale: 1, w: bw, h: bh, lost: 0, cost: 0 };
}

export function cost(t: Tracker, img: Grey, x0: number, y0: number, scale: number, limit: number) {
  const { samples, values } = t;
  let sum = 0, n = 0;
  for (let i = 0; i < values.length; i++) {
    const x = Math.round(x0 + samples[i * 2] * scale), y = Math.round(y0 + samples[i * 2 + 1] * scale);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
    sum += Math.abs(img.g[y * img.w + x] - values[i]);
    n++;
    if (sum > limit * values.length) return Infinity;
  }
  return n < values.length * 0.5 ? Infinity : sum / n;
}

export function search(t: Tracker, img: Grey, cx: number, cy: number, radius: number, step: number, scales: number[]) {
  let best = { x: cx, y: cy, s: scales[1] ?? scales[0], c: Infinity };
  for (const s of scales) for (let y = cy - radius; y <= cy + radius; y += step) for (let x = cx - radius; x <= cx + radius; x += step) {
    const c = cost(t, img, x, y, s, best.c);
    if (c < best.c) best = { x, y, s, c };
  }
  if (step > 1) {
    const { x: bx, y: by, s } = best;
    for (let y = by - step + 1; y < by + step; y++) for (let x = bx - step + 1; x < bx + step; x++) {
      const c = cost(t, img, x, y, s, best.c);
      if (c < best.c) best = { x, y, s, c };
    }
  }
  return best;
}

/** One tracking step on the current picture; true when the match is good and the tracker moved. */
export function trackStep(t: Tracker, img: Grey) {
  // Search wider the longer the match has been weak, so a product moved fast can be picked up again.
  const radius = Math.min(70, 16 + t.lost * 6);
  const scales = [t.scale * 0.94, t.scale, t.scale * 1.06].map((v) => Math.min(2.5, Math.max(0.4, v)));
  const best = search(t, img, t.x, t.y, radius, radius > 30 ? 3 : 2, scales);
  t.cost = best.c;
  if (best.c >= GOOD) { t.lost++; return false; }
  Object.assign(t, { x: best.x, y: best.y, scale: best.s, lost: 0 });
  // Adapt slowly to light and small turns while the match is clearly good.
  if (best.c < 12) for (let i = 0; i < t.values.length; i++) {
    const x = Math.round(best.x + t.samples[i * 2] * best.s), y = Math.round(best.y + t.samples[i * 2 + 1] * best.s);
    if (x >= 0 && y >= 0 && x < img.w && y < img.h) t.values[i] = t.values[i] * 0.9 + img.g[y * img.w + x] * 0.1;
  }
  return true;
}

/** Catch up with the movement that happened while locate was thinking: one wide search on the current picture. */
export function catchUp(t: Tracker, img: Grey) {
  const best = search(t, img, t.x, t.y, 70, 3, [0.85, 1, 1.15]);
  if (best.c < GOOD + 4) Object.assign(t, { x: best.x, y: best.y, scale: best.s, cost: best.c });
}

/** The tracked box in fractions of the w×h tracker image. */
export function trackerBox(t: Tracker, w: number, h: number): DetectBox {
  const bw = t.w * t.scale, bh = t.h * t.scale;
  return { x: (t.x - bw / 2) / w, y: (t.y - bh / 2) / h, w: bw / w, h: bh / h };
}

/** A box in fractions of the cropped picture `rect` → fractions of the whole W×H video frame. */
export const toFrame = (b: DetectBox, rect: Rect, W: number, H: number): DetectBox =>
  ({ x: (rect.x + b.x * rect.w) / W, y: (rect.y + b.y * rect.h) / H, w: (b.w * rect.w) / W, h: (b.h * rect.h) / H });

// ---------- the loop (browser) ----------
type Frame = { image: string; fine: HTMLCanvasElement; rect: Rect; signature: Uint8Array };
type LocateResult = { box: DetectBox | null; evidence: string; latencyMs: number };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function startDetection(get: () => DetectOptions, publish: (patch: Partial<DetectState>) => void) {
  let alive = true;
  const canvas = (w = 1, h = 1) => Object.assign(document.createElement("canvas"), { width: w, height: h });
  const context = (c: HTMLCanvasElement) => c.getContext("2d", { willReadFrequently: true })!;
  const small = canvas(), smallCtx = context(small);
  const tiny = canvas(32, 18), tinyCtx = context(tiny);
  const probe = canvas(160, 90), probeCtx = context(probe);
  const trk = canvas(), trkCtx = context(trk);

  const st = {
    rect: null as Rect | null, rectAt: 0, signature: null as Uint8Array | null, prevSig: null as Uint8Array | null,
    lastWatch: 0, stillSince: 0, changed: false, changedAt: 0, cutPending: false, startedAt: performance.now(),
    inflight: false, lastStart: -1e9, nextAllowed: 0, votes: 0, errors: 0, applied: 0, lastTranscript: "",
    stab: freshStabilizer(), confidence: null as number | null, heldUp: null as number | null,
    locating: false, lastLocate: -1e9, tracker: null as Tracker | null, tracked: null as string | null, everBoxed: null as string | null,
    anchorFails: 0, trackAt: 0, boxKey: "", error: null as string | null,
  };

  const fail = (e: unknown, prefix = "") => {
    const error = prefix + message(e);
    if (alive && error !== st.error) publish({ error: (st.error = error) });
  };
  const video = () => {
    const v = get().video.current;
    return v && v.videoWidth && v.readyState >= 2 && !(v.paused && !v.srcObject) ? v : null;
  };
  const thOf = (rect: Rect) => Math.max(8, Math.round((TW * rect.h) / rect.w));
  const greyOf = (source: CanvasImageSource, src: Rect, th: number): Grey => {
    if (trk.width !== TW || trk.height !== th) Object.assign(trk, { width: TW, height: th });
    trkCtx.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, TW, th);
    return { g: luma(trkCtx.getImageData(0, 0, TW, th).data, TW * th), w: TW, h: th };
  };
  // Measure change inside the picture only: in a small OBS window the black border would swamp the average.
  const signatureOf = (v: HTMLVideoElement, r: Rect) => {
    tinyCtx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, 32, 18);
    return luma(tinyCtx.getImageData(0, 0, 32, 18).data, 32 * 18);
  };
  const capture = (v: HTMLVideoElement): Frame => {
    const rect = st.rect!;
    const scale = Math.min(1, DECIDE_PX / Math.max(rect.w, rect.h));
    Object.assign(small, { width: Math.max(1, Math.round(rect.w * scale)), height: Math.max(1, Math.round(rect.h * scale)) });
    smallCtx.drawImage(v, rect.x, rect.y, rect.w, rect.h, 0, 0, small.width, small.height);
    // A sharper copy of the same frame for locate; encoded only if a locate actually needs it.
    const fineScale = Math.min(1, LOCATE_PX / Math.max(rect.w, rect.h));
    const fine = canvas(Math.max(1, Math.round(rect.w * fineScale)), Math.max(1, Math.round(rect.h * fineScale)));
    fine.getContext("2d")!.drawImage(v, rect.x, rect.y, rect.w, rect.h, 0, 0, fine.width, fine.height);
    return { image: small.toDataURL("image/jpeg", 0.82), fine, rect, signature: signatureOf(v, rect) };
  };

  const dropBox = () => {
    st.tracker = null;
    st.tracked = null;
    st.anchorFails = 0;
    if (st.boxKey) { st.boxKey = ""; publish({ box: null }); }
  };
  const publishBox = (v: HTMLVideoElement) => {
    const t = st.tracker, rect = st.rect;
    if (!t || !rect) return;
    const b = toFrame(trackerBox(t, TW, thOf(rect)), rect, v.videoWidth, v.videoHeight);
    const box = { x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4) };
    const key = `${box.x},${box.y},${box.w},${box.h}`;
    if (key !== st.boxKey) { st.boxKey = key; publish({ box }); }
  };

  async function locate(code: string, frame: Frame) {
    st.locating = true;
    st.lastLocate = performance.now();
    try {
      const { box } = await studioPost<LocateResult>("/agent/live/locate", { image: frame.fine.toDataURL("image/jpeg", 0.88), code });
      // Locate answers seconds later: keep the result only if that product is still the one on screen, in the same layout.
      if (!alive || st.stab.confirmed !== code || frame.rect !== st.rect) return;
      if (!box) {
        // A re-anchor miss keeps the tracked box; two misses in a row mean the product really left the frame.
        if (st.tracked === code && ++st.anchorFails < 2) return;
        dropBox();
        return;
      }
      const th = thOf(frame.rect);
      const t = makeTracker(greyOf(frame.fine, { x: 0, y: 0, w: frame.fine.width, h: frame.fine.height }, th), box);
      const v = video();
      if (v) catchUp(t, greyOf(v, frame.rect, th));
      Object.assign(st, { tracker: t, tracked: code, everBoxed: code, anchorFails: 0 });
      if (v) publishBox(v);
    } catch (e) {
      fail(e, "locate: ");
    } finally {
      st.locating = false;
    }
  }

  function apply(d: Decision, cut: boolean, frame: Frame, latencyMs: number) {
    st.stab = stabilize(st.stab, d.product, d.productConfidence, cut, !!st.tracker && st.tracker.lost === 0);
    const { candidate, confirmed } = st.stab;
    if (!confirmed || (candidate && st.tracked && st.tracked !== candidate)) dropBox();
    if (candidate && candidate === confirmed) {
      st.confidence = d.productConfidence;
      st.heldUp = d.heldUp;
      if (st.tracked !== confirmed && !st.locating && performance.now() - st.lastLocate >= LOCATE_GAP_MS) locate(confirmed, frame);
    } else if (!confirmed) {
      st.confidence = st.heldUp = null;
    }
    st.error = null;
    publish({ product: confirmed, confidence: st.confidence, heldUp: st.heldUp, lastDecision: d, latencyMs: Math.round(latencyMs), error: null });
  }

  async function decide(frame: Frame, cut: boolean, transcript: string) {
    st.inflight = true;
    const started = performance.now();
    const o = get();
    try {
      const d = await director.decide({
        image: frame.image, transcript, current: o.current, motions: o.motions,
        products: o.products.map(({ id, name, description, distinct }) => ({ id, name, description, distinct })),
      });
      if (!alive) return;
      st.errors = 0;
      st.applied++;
      apply(d, cut, frame, performance.now() - started);
      get().onDecision?.(d);
    } catch (e) {
      st.errors++;
      st.nextAllowed = performance.now() + Math.min(10000, 1000 * st.errors); // back off, keep running
      fail(e);
    } finally {
      st.inflight = false;
    }
  }

  function track(v: HTMLVideoElement, now: number) {
    st.trackAt = now;
    const t = st.tracker!, rect = st.rect!;
    // A weak match never hides the box: it stays where it was, the search widens, and locate re-anchors it.
    if (trackStep(t, greyOf(v, rect, thOf(rect)))) publishBox(v);
    const code = st.tracked;
    if (code && code === st.stab.confirmed && !st.locating && now - st.lastLocate >= LOCATE_GAP_MS && (t.lost >= 3 || now - st.lastLocate >= REANCHOR_MS))
      locate(code, capture(v));
  }

  // Probe motion ~8×/s on a 32×18 thumbnail (free) and call the Decisions API only when it is worth it:
  // the first frame, a change that has settled (a product raised and shown), a second look at an unsure answer,
  // or new speech over a still picture.
  function tick() {
    const v = video();
    if (!alive || !v) return;
    const now = performance.now();
    try {
      if (st.tracker && st.rect && now - st.trackAt >= TRACK_MS) track(v, now);
      if (now - st.lastWatch < WATCH_MS) return;
      st.lastWatch = now;
      // Re-find the picture area about once a second (the OBS layout rarely moves).
      if (!st.rect || now - st.rectAt > 1000) {
        probeCtx.drawImage(v, 0, 0, 160, 90);
        const rect = contentRect(probeCtx.getImageData(0, 0, 160, 90).data, 160, 90, v.videoWidth, v.videoHeight);
        if (!st.rect || Math.abs(rect.x - st.rect.x) > 8 || Math.abs(rect.w - st.rect.w) > 8 || Math.abs(rect.h - st.rect.h) > 8) {
          if (st.rect) { st.signature = st.prevSig = null; dropBox(); }
          st.rect = rect;
        }
        st.rectAt = now;
      }
      const sig = signatureOf(v, st.rect);
      const motion = difference(sig, st.prevSig);
      st.prevSig = sig;
      const change = st.signature ? difference(sig, st.signature) : 255;
      if (st.signature && change > CUT) st.cutPending = true;
      if (change > CHANGE && !st.changed) { st.changed = true; st.changedAt = now; }
      st.stillSince = motion < STILL ? st.stillSince || now : 0;
      const settled = st.stillSince > 0 && now - st.stillSince >= SETTLE_MS;

      // Confirmed but no box (locate missed or tracking was dropped): retry, sooner for a product never boxed.
      const confirmed = st.stab.confirmed;
      const retry = st.everBoxed === confirmed ? (settled ? 4000 : 6000) : LOCATE_GAP_MS;
      if (confirmed && !st.tracker && !st.locating && now - st.lastLocate > retry) locate(confirmed, capture(v));

      if (st.inflight || now < st.nextAllowed || now - st.lastStart < MIN_GAP_MS) return;
      const transcript = get().transcript();
      let reason: "first" | "change" | "vote" | "speech" | null = null;
      if (!st.signature) reason = settled || now - st.startedAt > 1500 ? "first" : null;
      else if (st.changed && (settled || now - st.changedAt > CHANGE_WAIT_MS)) reason = "change";
      else if (st.stab.needVote && st.votes < 2 && now - st.lastStart > (settled ? 900 : 1500)) reason = "vote";
      else if (transcript !== st.lastTranscript && now - st.lastStart > SPEECH_GAP_MS) reason = "speech";
      if (!reason) return;
      const frame = capture(v);
      st.votes = reason === "vote" ? st.votes + 1 : 0;
      const cut = st.cutPending && st.applied > 0;
      Object.assign(st, { cutPending: false, changed: false, signature: frame.signature, lastStart: now, lastTranscript: transcript });
      decide(frame, cut, transcript);
    } catch (e) {
      fail(e); // e.g. a cross-origin video taints the canvas
    }
  }

  const timer = setInterval(tick, TICK_MS);
  return () => {
    alive = false; // requests already sent finish, but their results are dropped
    clearInterval(timer);
  };
}

export function useLiveDetection(options: DetectOptions): DetectState {
  const [state, setState] = useState<DetectState>(idleDetect);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });
  const { enabled } = options;
  useEffect(() => {
    if (!enabled) return;
    const publish = (patch: Partial<DetectState>) => setState((s) => ({ ...s, ...patch }));
    publish({ ...idleDetect, running: true });
    const stop = startDetection(() => latest.current, publish);
    return () => { stop(); setState(idleDetect); };
  }, [enabled]);
  return state;
}
