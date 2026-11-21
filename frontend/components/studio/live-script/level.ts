// The level meter: how loud the microphone is right now, from the analyser's time domain bytes.

/** Root mean square of 8 bit samples centred on 128, scaled so ordinary speech fills most of the bar. */
export function rmsLevel(samples: ArrayLike<number>, gain = 3.2): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let n = 0; n < samples.length; n++) {
    const value = ((samples[n] ?? 128) - 128) / 128;
    sum += value * value;
  }
  return Math.min(1, Math.sqrt(sum / samples.length) * gain);
}

/** Rises quickly and falls slowly, so the bar is easy to read. */
export function smoothLevel(previous: number, next: number, attack = 0.6, release = 0.12): number {
  const rate = next > previous ? attack : release;
  return previous + (next - previous) * rate;
}
