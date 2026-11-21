// The rolling transcript shown to the seller: the last few lines, newest at the bottom. Text that is still being
// spoken is a partial line, drawn lighter, and it is replaced as more words arrive until the result is final.

export type Line = { id: number; text: string; final: boolean; tsMs: number };
export type Transcript = { lines: Line[]; nextId: number };
export type Result = { text: string; final: boolean; tsMs: number };

export const EMPTY_TRANSCRIPT: Transcript = { lines: [], nextId: 1 };
export const KEEP_LINES = 6;

/**
 * Fold one speech result into the transcript. `text` is everything said so far in that utterance, so a partial
 * replaces the previous partial instead of adding to it. An empty final removes a partial that came to nothing.
 */
export function applyResult(transcript: Transcript, result: Result, keep = KEEP_LINES): Transcript {
  const text = result.text.trim();
  const last = transcript.lines[transcript.lines.length - 1];
  const open = last && !last.final ? last : null;

  if (!text) {
    if (!result.final || !open) return transcript;
    return { ...transcript, lines: transcript.lines.slice(0, -1) };
  }

  let lines: Line[];
  let nextId = transcript.nextId;
  if (open) {
    lines = [...transcript.lines.slice(0, -1), { ...open, text, final: result.final, tsMs: result.tsMs }];
  } else {
    lines = [...transcript.lines, { id: nextId, text, final: result.final, tsMs: result.tsMs }];
    nextId += 1;
  }
  return { lines: lines.slice(-keep), nextId };
}

/** The lines to draw: the newest few, oldest first. */
export const visibleLines = (transcript: Transcript, count = 4): Line[] => transcript.lines.slice(-count);
