// When the transcription connection is replaced, and how long to wait before trying again. All of it is a pure
// function of the numbers it is given, so it can be tested without a clock or a network.

export const ROTATE_AFTER_MS = 55 * 60_000;
/** After this the socket is replaced even in the middle of speech, because the connection has a one hour limit. */
export const FORCE_AFTER_MS = 58 * 60_000;
/** A secret that is about to expire counts as expired. */
export const SECRET_MARGIN_MS = 30_000;
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_MAX_MS = 15_000;
export const MAX_ATTEMPTS = 8;

/** Exponential, between half of the ceiling and the ceiling so many sellers do not retry in the same instant. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt));
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export function nextRetry(attempt: number, random: () => number = Math.random): { delayMs: number; giveUp: boolean } {
  return attempt >= MAX_ATTEMPTS ? { delayMs: 0, giveUp: true } : { delayMs: backoffMs(attempt, random), giveUp: false };
}

/** When a secret stops working, in milliseconds since 1970, from the number of seconds or milliseconds or the date text the backend gives. */
export function expiresAtMs(expiresAt: string | number): number | null {
  if (typeof expiresAt === "number") return Number.isFinite(expiresAt) ? (expiresAt < 1e11 ? expiresAt * 1000 : expiresAt) : null;
  const numeric = Number(expiresAt);
  if (expiresAt.trim() !== "" && Number.isFinite(numeric)) return numeric < 1e11 ? numeric * 1000 : numeric;
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) ? null : parsed;
}

export function secretExpired(expiresAt: string | number, now: number, margin = SECRET_MARGIN_MS): boolean {
  const at = expiresAtMs(expiresAt);
  return at === null ? false : now + margin >= at;
}

/**
 * Whether the socket should be replaced now. The switch waits for the end of an utterance (nobody speaking and no
 * committed text still on its way back), so no words are cut, unless the connection is about to hit its hard limit.
 */
export function switchDecision(input: { openedAt: number; now: number; speaking: boolean; awaiting: number }): "none" | "wait" | "switch" {
  const age = input.now - input.openedAt;
  if (age < ROTATE_AFTER_MS) return "none";
  if (age >= FORCE_AFTER_MS) return "switch";
  return !input.speaking && input.awaiting === 0 ? "switch" : "wait";
}
