// PCM chunks from the microphone worklet travel to the transcription as base64 text.

/** Base64 of raw bytes. Done in slices so a long chunk never overflows the argument limit of fromCharCode. */
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}
