import type { TranscriptionCreds } from "./api";
import { createMockSource, type MockHandlers } from "./mock-source";

// The one place that knows how speech becomes text. The panel only sees this small interface, so the connection method
// can change without touching the panel. `text` of every result is everything said so far in that utterance.

export type SourceHandlers = MockHandlers;
export type TranscriptionSource = { start: () => Promise<void>; stop: () => void };

/** Set at build time (NEXT_PUBLIC_LIVE_MOCK_STT=1) to run the whole panel without a microphone or a transcription service. */
export const FORCE_MOCK = process.env.NEXT_PUBLIC_LIVE_MOCK_STT === "1";

/** The backend marks a demo session with the model name mock (or a secret that starts with mock). */
export const isMockSession = (creds: TranscriptionCreds) => FORCE_MOCK || creds.model === "mock" || creds.clientSecret.startsWith("mock");

/**
 * The real connection to the live transcription. It is NOT written yet: the exact connection method of the OpenAI
 * realtime transcription API is being verified, and a guess here would fail in front of a live audience. Until that is
 * settled it fails at once with a message the seller can read, instead of pretending to listen.
 */
function createRealtimeSource(): TranscriptionSource {
  return {
    start: () => Promise.reject(new Error("ยังไม่ได้เชื่อมต่อบริการถอดเสียงสด")),
    stop: () => undefined,
  };
}

export function createSource(creds: TranscriptionCreds, _stream: MediaStream | null, handlers: SourceHandlers): TranscriptionSource {
  return isMockSession(creds) ? createMockSource({ handlers }) : createRealtimeSource();
}
