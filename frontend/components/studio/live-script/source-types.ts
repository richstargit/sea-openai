// The small interface between the panel and whatever turns speech into text, so the real connection and the offline
// stand in are interchangeable.

export type SourceState = "connecting" | "listening" | "reconnecting";

export type SourceResult = {
  /** Which utterance this is: the item id for the real connection. */
  id: string;
  /** Everything said so far in this utterance, or only the new words when `mode` is append. */
  text: string;
  final: boolean;
  /** Milliseconds since listening started. */
  tsMs: number;
  mode?: "replace" | "append";
};

export type SourceHandlers = {
  onCommitted: (id: string, tsMs: number) => void;
  onResult: (result: SourceResult) => void;
  onFailed: (id: string) => void;
  onLevel?: (rms: number) => void;
  onState?: (state: SourceState) => void;
  /** The connection could not be kept: listening has stopped. */
  onError: (message: string) => void;
  onClose: () => void;
};

export type TranscriptionSource = { start: () => Promise<void>; stop: () => Promise<void> };
