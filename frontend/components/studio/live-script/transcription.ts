import type { TranscriptionCreds } from "./api";
import { createMockSource } from "./mock-source";
import { createRealtimeSource } from "./realtime-source";
import type { SourceHandlers, TranscriptionSource } from "./source-types";

// The one place that picks how speech becomes text. The panel only sees the small interface in source-types.ts.

export type { SourceHandlers, TranscriptionSource } from "./source-types";

/** Set at build time (NEXT_PUBLIC_LIVE_MOCK_STT=1) to run the whole panel without a microphone or a transcription service. */
export const FORCE_MOCK = process.env.NEXT_PUBLIC_LIVE_MOCK_STT === "1";

/** The backend marks a demo session with the model name mock (or a secret that starts with mock). */
export const isMockSession = (creds: TranscriptionCreds) => FORCE_MOCK || creds.model === "mock" || creds.clientSecret.startsWith("mock");

export function createSource(args: {
  creds: TranscriptionCreds;
  stream: MediaStream | null;
  handlers: SourceHandlers;
  refreshSecret: () => Promise<TranscriptionCreds>;
}): TranscriptionSource {
  if (isMockSession(args.creds)) return createMockSource({ handlers: args.handlers });
  // A real session without a microphone must never fall back to made up speech.
  if (!args.stream) throw new Error("ไม่ได้รับสิทธิ์ใช้ไมโครโฟน");
  return createRealtimeSource({ creds: args.creds, stream: args.stream, handlers: args.handlers, refreshSecret: args.refreshSecret });
}
