// The transcript as the transcription reports it: one item per committed utterance, known by its id. Events for an
// item can arrive in any order and a partial text can be revised, so every change is keyed by the id, the partial text
// of an item is replaced (never glued onto), and finished texts are released in the order they were committed, so the
// backend hears the speech in the order it was said even when a later item finishes first.

export type ItemState = "open" | "final" | "failed";
export type Item = { id: string; text: string; state: ItemState; committedAt: number; committed: boolean; released: boolean };
export type Items = { order: string[]; byId: Record<string, Item> };
export type Line = { id: string; text: string; final: boolean; tsMs: number };

export const EMPTY_ITEMS: Items = { order: [], byId: {} };
export const KEEP_LINES = 6;
const KEEP_ITEMS = 40;

function ensure(items: Items, id: string, tsMs: number): Items {
  if (items.byId[id]) return items;
  const item: Item = { id, text: "", state: "open", committedAt: tsMs, committed: false, released: false };
  return { order: [...items.order, id], byId: { ...items.byId, [id]: item } };
}

function put(items: Items, item: Item): Items {
  return { ...items, byId: { ...items.byId, [item.id]: item } };
}

/** The utterance was cut and sent for transcription. This fixes its place in the order. */
export function onCommitted(items: Items, id: string, tsMs: number): Items {
  const known = ensure(items, id, tsMs);
  const item = known.byId[id];
  if (!item || item.committed) return known;
  return put(known, { ...item, committed: true, committedAt: tsMs });
}

/** Text so far. `replace` (the default) swaps the whole partial text; `append` adds a delta to it. A finished item ignores it. */
export function onPartial(items: Items, id: string, text: string, tsMs: number, mode: "replace" | "append" = "replace"): Items {
  const known = ensure(items, id, tsMs);
  const item = known.byId[id];
  if (!item || item.state !== "open") return known;
  return put(known, { ...item, text: mode === "append" ? item.text + text : text });
}

/** The finished text. Nothing said (an empty text) counts as a failure so it never holds the others back. */
export function onFinal(items: Items, id: string, text: string, tsMs: number): Items {
  const known = ensure(items, id, tsMs);
  const item = known.byId[id];
  if (!item || item.state === "failed") return known;
  if (!text.trim()) return put(known, { ...item, text: "", state: "failed" });
  return put(known, { ...item, text, state: "final" });
}

export function onFailed(items: Items, id: string): Items {
  const item = items.byId[id];
  if (!item) return items;
  return put(items, { ...item, text: "", state: "failed" });
}

/**
 * The finished texts that can go to the backend now, oldest first. An item still waiting for its text holds back every
 * later one, so order is kept. Each text is released once.
 */
export function drainFinals(items: Items): { items: Items; finals: Item[] } {
  const finals: Item[] = [];
  let next = items;
  for (const id of items.order) {
    const item = items.byId[id];
    if (!item) continue;
    if (item.state === "open") break;
    if (item.state === "final" && !item.released) {
      const released = { ...item, released: true };
      finals.push(released);
      next = put(next, released);
    }
  }
  return { items: finals.length ? prune(next) : items, finals };
}

/** Old items that are done are forgotten so the state does not grow all evening. */
function prune(items: Items): Items {
  if (items.order.length <= KEEP_ITEMS) return items;
  const drop = new Set<string>();
  for (const id of items.order) {
    if (items.order.length - drop.size <= KEEP_ITEMS) break;
    const item = items.byId[id];
    if (item && item.state !== "open") drop.add(id);
    else break;
  }
  if (drop.size === 0) return items;
  const byId = { ...items.byId };
  for (const id of drop) delete byId[id];
  return { order: items.order.filter((id) => !drop.has(id)), byId };
}

/** What the transcript view shows: the newest lines, oldest first, partial text included. */
export function toLines(items: Items, keep = KEEP_LINES): Line[] {
  const lines: Line[] = [];
  for (const id of items.order) {
    const item = items.byId[id];
    if (!item || item.state === "failed" || !item.text.trim()) continue;
    lines.push({ id: item.id, text: item.text.trim(), final: item.state === "final", tsMs: item.committedAt });
  }
  return lines.slice(-keep);
}

/** The newest text still being transcribed, for the throttled partial update. */
export function latestOpen(items: Items): Item | null {
  for (let n = items.order.length - 1; n >= 0; n--) {
    const item = items.byId[items.order[n] ?? ""];
    if (item && item.state === "open" && item.text.trim()) return item;
  }
  return null;
}

/** How many committed utterances are still waiting for their text. */
export function awaiting(items: Items): number {
  return items.order.reduce((count, id) => {
    const item = items.byId[id];
    return item && item.committed && item.state === "open" ? count + 1 : count;
  }, 0);
}
