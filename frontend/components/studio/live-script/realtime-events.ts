// What the transcription server says, reduced to the few things the panel cares about. Anything else is ignored.

export type Decoded =
  | { kind: "committed"; itemId: string }
  | { kind: "partial"; itemId: string; text: string; replace: boolean }
  | { kind: "final"; itemId: string; text: string }
  | { kind: "failed"; itemId: string; message: string }
  | { kind: "error"; message: string; code: string | null }
  | { kind: "ignore" };

const IGNORE: Decoded = { kind: "ignore" };

const asText = (value: unknown): string | null => (typeof value === "string" ? value : null);
const asRecord = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);

/**
 * Event names are the ones of the realtime transcription API. A delta carries either the whole text so far (field
 * `transcript`, which replaces the partial) or only the new words (field `delta`, which is added to it); both are
 * understood. Thai has no spaces, so the text is passed on exactly as received.
 */
export function decodeServerEvent(raw: string): Decoded {
  let event: Record<string, unknown> | null;
  try { event = asRecord(JSON.parse(raw)); } catch { return IGNORE; }
  if (!event) return IGNORE;
  const type = asText(event.type);
  const itemId = asText(event.item_id);

  switch (type) {
    case "input_audio_buffer.committed":
      return itemId ? { kind: "committed", itemId } : IGNORE;
    case "conversation.item.input_audio_transcription.delta": {
      if (!itemId) return IGNORE;
      const whole = asText(event.transcript);
      if (whole !== null) return { kind: "partial", itemId, text: whole, replace: true };
      const delta = asText(event.delta);
      return delta !== null ? { kind: "partial", itemId, text: delta, replace: false } : IGNORE;
    }
    case "conversation.item.input_audio_transcription.completed": {
      const transcript = asText(event.transcript);
      return itemId && transcript !== null ? { kind: "final", itemId, text: transcript } : IGNORE;
    }
    case "conversation.item.input_audio_transcription.failed": {
      const error = asRecord(event.error);
      return itemId ? { kind: "failed", itemId, message: asText(error?.message) ?? "" } : IGNORE;
    }
    case "error": {
      const error = asRecord(event.error);
      return { kind: "error", message: asText(error?.message) ?? asText(event.message) ?? "", code: asText(error?.code) };
    }
    default:
      return IGNORE;
  }
}

/** Errors that only mean an empty or too short piece of audio was committed: nothing to do and nothing to tell the seller. */
export const isBenignError = (code: string | null, message: string) =>
  /commit_empty|buffer_too_small|buffer_empty/i.test(code ?? "") || /buffer (is )?(too small|empty)|only 0\.?0*ms/i.test(message);

/** Errors that mean the short lived secret can no longer be used, so a fresh one must be asked for. */
export const isAuthError = (code: string | null, message: string) =>
  /expired|invalid_api_key|unauthorized|authentication/i.test(code ?? "") || /expired|unauthorized|invalid api key/i.test(message);
