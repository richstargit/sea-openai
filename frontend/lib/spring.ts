/*
 * Motion helpers taken from Apple's "Designing Fluid Interfaces" (WWDC 2018).
 * Springs, not durations, for anything a finger can touch.
 */

/** Default UI spring: critically damped, no overshoot. */
export const spring = { type: "spring", bounce: 0, duration: 0.4 } as const;

/** Only for motion that already carried momentum (a flick, a pop). */
export const springBouncy = { type: "spring", bounce: 0.2, duration: 0.45 } as const;

/** Reduced motion: a short cross-fade instead of travel or overshoot. */
export const fade = { duration: 0.15 } as const;

/**
 * Where a gesture is *going*, not where it was released.
 * Exponential-decay projection, same as scroll deceleration.
 * @param velocity px/s at release
 */
export function project(velocity: number, decelerationRate = 0.998) {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary: the further, the less it follows. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/** Nearest value in `points` to `target`. */
export function nearest(points: number[], target: number) {
  return points.reduce((best, p) =>
    Math.abs(p - target) < Math.abs(best - target) ? p : best,
  );
}
