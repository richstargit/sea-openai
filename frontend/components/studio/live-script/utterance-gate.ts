// What leaves the browser and when. Rules from the contract: a final result goes out at once, partial results go out
// at most every 1.5 seconds and only the latest one, and two requests for the same session are never in flight together.
// A stale utterance is dropped (an older partial is replaced by a newer one, a partial never overtakes a final).
// Two finals that pile up while a request is out are joined into one, so no speech is lost.
// Everything here is a pure function of the state and the time, so it can be tested without timers.

export type Utterance = { text: string; final: boolean; tsMs: number };
export type Gate = { inFlight: boolean; lastPartialAt: number; pending: Utterance | null };
export type Step = { gate: Gate; send: Utterance | null; flushAt: number | null };

export const PARTIAL_EVERY_MS = 1500;
export const MAX_CHARS = 1000;

export const newGate = (): Gate => ({ inFlight: false, lastPartialAt: Number.NEGATIVE_INFINITY, pending: null });

/** The newest words win when the text is too long for one request. */
const clip = (text: string) => (text.length > MAX_CHARS ? text.slice(text.length - MAX_CHARS) : text);

function merge(pending: Utterance | null, incoming: Utterance): Utterance | null {
  if (!pending) return incoming;
  if (incoming.final) {
    if (pending.final) return { text: clip(`${pending.text} ${incoming.text}`), final: true, tsMs: incoming.tsMs };
    return incoming; // a final replaces the partial it completes
  }
  // A partial never replaces a waiting final; against another partial the newer one wins.
  return pending.final ? pending : incoming;
}

/** Decide whether the waiting utterance can leave now, and if not when to look again. */
function release(gate: Gate, now: number): Step {
  const pending = gate.pending;
  if (gate.inFlight || !pending) return { gate, send: null, flushAt: null };
  if (pending.final) return { gate: { ...gate, inFlight: true, pending: null }, send: pending, flushAt: null };
  const due = gate.lastPartialAt + PARTIAL_EVERY_MS;
  if (now >= due) return { gate: { inFlight: true, lastPartialAt: now, pending: null }, send: pending, flushAt: null };
  return { gate, send: null, flushAt: due };
}

/** A new speech result arrived. */
export function offer(gate: Gate, utterance: Utterance, now: number): Step {
  const text = clip(utterance.text.trim());
  if (!text) return { gate, send: null, flushAt: null };
  const merged = merge(gate.pending, { ...utterance, text });
  return release({ ...gate, pending: merged }, now);
}

/** The request that was in flight finished (well or badly): the next waiting utterance may go. */
export function complete(gate: Gate, now: number): Step {
  return release({ ...gate, inFlight: false }, now);
}

/** A timer set from `flushAt` fired. */
export function flush(gate: Gate, now: number): Step {
  return release(gate, now);
}
