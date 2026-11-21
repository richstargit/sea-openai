import type { Suggestion } from "./api";

// What the hero area shows: the current suggestion, and a quiet history of the last few before it.

export type SuggestionState = { current: Suggestion | null; history: Suggestion[] };
export const EMPTY_SUGGESTIONS: SuggestionState = { current: null, history: [] };
export const HISTORY = 3;
export const MAX_LINES = 3;

const same = (a: string[], b: string[]) => a.length === b.length && a.every((line, n) => line === b[n]);

/** Trim the lines and keep at most three. A suggestion with nothing to say and nothing to warn about is dropped. */
export function clean(suggestion: Suggestion): Suggestion | null {
  const next = suggestion.next.map((line) => line.trim()).filter(Boolean).slice(0, MAX_LINES);
  if (next.length === 0 && !suggestion.warning) return null;
  return { ...suggestion, next };
}

/**
 * A new answer from the backend. Nothing (null) changes nothing. The same id, or the same lines again, updates the
 * current suggestion in place; a different suggestion pushes the current one into the history.
 */
export function applySuggestion(state: SuggestionState, incoming: Suggestion | null): SuggestionState {
  const next = incoming ? clean(incoming) : null;
  if (!next) return state;
  const current = state.current;
  if (!current) return { current: next, history: state.history };
  if (next.id === current.id || same(next.next, current.next)) return { current: next, history: state.history };
  return { current: next, history: [current, ...state.history].slice(0, HISTORY) };
}
