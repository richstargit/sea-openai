// The level meter: the worklet reports how loud the microphone is, and this makes it easy to read.

/** Raw RMS of speech is small, so it is scaled up and held between 0 and 1. */
export const scaleLevel = (rms: number, gain = 5): number => Math.min(1, Math.max(0, rms * gain));

/** Rises quickly and falls slowly, so the bar is easy to read. */
export function smoothLevel(previous: number, next: number, attack = 0.6, release = 0.12): number {
  const rate = next > previous ? attack : release;
  return previous + (next - previous) * rate;
}
