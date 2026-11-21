"use client";

// The seller keeps talking. The browser listens through the microphone, the backend works out what they are saying,
// and this page shows what to say next in the style they picked. A playbook is made first (research, hooks, lines
// for each part of the live), then one session per listening run. Same origin like the rest of the studio: Next
// forwards /agent/* to the backend and the browser sends the session cookie on its own.
const ROOT = "/agent/live-script";
const REMEMBER_SHOW = "snappromo-live-show";
const REMEMBER_SIZE = "snappromo-live-size";

export type Offer = { price?: string; promotion?: string; stock?: string; endsAt?: string };

/** The playbook as the backend describes it. Its inner shape is read defensively by the all lines view. */
export type Playbook = Record<string, unknown>;

export type Show = {
  id: string;
  status: "running" | "ready" | "error";
  step: string | null;
  stepIndex: number;
  stepCount: number;
  /** Already a Thai message meant for the user. */
  error: string | null;
  createdAt: string;
  profileName: string | null;
  product: { name: string; category: string } | null;
  playbook: Playbook | null;
  /** A link for OBS, when the backend gives one with the show. */
  prompterUrl?: string;
  warnings?: string[];
  /** False when the check that every line has a source could not run. */
  verified?: boolean;
};

export type CreateShowInput = {
  profileId?: string;
  brief: string;
  images: string[];
  offer?: Offer;
};

export type Stage = "open" | "features" | "demo" | "price" | "offer" | "objection" | "chat" | "close" | "unknown";
export type Cue = "price" | "promo" | "gift" | "flash" | "product";

/** What to say next. `next` is one to three short lines. */
export type Suggestion = {
  id: string;
  topic: string | null;
  productName: string | null;
  stage: Stage;
  next: string[];
  cue: Cue | null;
  warning: { text: string; level: "risk" | "unsupported" } | null;
  /** The seller has stalled, so the suggestion should stand out. */
  hesitation: boolean;
};

/** One piece of speech. `text` is everything said so far in this utterance, not just the newest words. */
export type Utterance = { text: string; final: boolean; tsMs: number };

export type TranscriptionCreds = { clientSecret: string; expiresAt: string | number; model: string; url: string };
export type SessionStart = { sessionId: string; transcription: TranscriptionCreds; prompterUrl?: string; showOnStream?: boolean };

export type ReplyStatus = "answered" | "unknown" | "declined";
export type Reply = { text: string; status: ReplyStatus; note: string | null; /** What the answer stands on. */ basis?: string[] };

export class LiveApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOT}${path}`, { ...init, cache: "no-store" }).catch(() => {
    throw new LiveApiError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", 0);
  });
  if (response.status === 401) throw new LiveApiError("กรุณาเข้าสู่ระบบอีกครั้ง", 401);
  const body = (await response.json().catch(() => null)) as (T & { message_TH?: string; message?: string }) | null;
  if (!response.ok || !body) throw new LiveApiError(body?.message_TH ?? body?.message ?? "เกิดข้อผิดพลาด", response.status);
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const liveApi = {
  create: (input: CreateShowInput) => request<{ show: Show }>("/shows", json("POST", input)).then((r) => r.show),
  get: (id: string) => request<{ show: Show }>(`/shows/${id}`).then((r) => r.show),
  remove: (id: string) => request<unknown>(`/shows/${id}`, { method: "DELETE" }),
  reply: (id: string, comment: string) => request<{ reply: Reply }>(`/shows/${id}/reply`, json("POST", { comment })).then((r) => r.reply),
  /** One session per listening run. The answer carries the short lived secret for the live transcription connection. */
  startSession: (showId: string, body: { showOnStream?: boolean }) =>
    request<SessionStart>(`/shows/${showId}/session`, json("POST", body)),
  /** Each speech result goes here, and what to say next comes back. */
  sendUtterance: (sessionId: string, utterance: Utterance) =>
    request<{ suggestion: Suggestion | null }>(`/sessions/${sessionId}/utterance`, json("POST", utterance)).then((r) => r.suggestion),
  stopSession: (sessionId: string) => request<unknown>(`/sessions/${sessionId}`, { method: "DELETE" }),
  setShowOnStream: (sessionId: string, showOnStream: boolean) => request<unknown>(`/sessions/${sessionId}`, json("PATCH", { showOnStream })),
};

// The latest show is remembered so a refresh picks it up again. Listening is never remembered: it needs a fresh click.
// Storage can be blocked, so all of this is optional.
export function recallShow(): string {
  try { return localStorage.getItem(REMEMBER_SHOW) ?? ""; } catch { return ""; }
}
export function rememberShow(id: string) {
  try { localStorage.setItem(REMEMBER_SHOW, id); } catch { /* storage is optional */ }
}
export function forgetShow() {
  try { localStorage.removeItem(REMEMBER_SHOW); } catch { /* storage is optional */ }
}

export type TextSize = "s" | "m" | "l";
export const SIZES: TextSize[] = ["s", "m", "l"];
export function recallSize(): TextSize {
  try {
    const saved = localStorage.getItem(REMEMBER_SIZE);
    return saved === "s" || saved === "m" || saved === "l" ? saved : "m";
  } catch { return "m"; }
}
export function rememberSize(size: TextSize) {
  try { localStorage.setItem(REMEMBER_SIZE, size); } catch { /* storage is optional */ }
}

/** Only the offer fields that were filled in are sent, so an empty field never reads as a price of nothing. */
export function cleanOffer(offer: Offer): Offer | undefined {
  const entries = Object.entries(offer).map(([key, value]) => [key, (value ?? "").trim()] as const).filter(([, value]) => value.length > 0);
  return entries.length ? (Object.fromEntries(entries) as Offer) : undefined;
}
