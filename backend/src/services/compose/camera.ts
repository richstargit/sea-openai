import type { Focus, ShotPlan } from '@/services/compose/types.js'

export const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function cameraAt(plan: ShotPlan, progress: number): Focus {
  const t = easeInOut(Math.min(1, Math.max(0, progress)))
  return {
    x: lerp(plan.from.x, plan.to.x, t),
    y: lerp(plan.from.y, plan.to.y, t),
    zoom: lerp(plan.from.zoom, plan.to.zoom, t),
  }
}

/**
 * The part of the photo to draw. The scale is the same on both axes (cover
 * fit), so the photo is cropped and never stretched, and the crop is kept
 * inside the photo at every zoom.
 */
export function sourceRect(
  focus: Focus,
  image: { width: number; height: number },
  view: { width: number; height: number },
  anchor: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { sx: number; sy: number; sw: number; sh: number } {
  const cover = Math.max(view.width / image.width, view.height / image.height)
  const zoom = Math.max(1, focus.zoom)
  const sw = view.width / cover / zoom
  const sh = view.height / cover / zoom
  // The focus point lands at `anchor` in the view (0.5 is the middle), as far as the photo allows.
  const sx = Math.min(
    Math.max(focus.x * image.width - anchor.x * sw, 0),
    image.width - sw,
  )
  const sy = Math.min(
    Math.max(focus.y * image.height - anchor.y * sh, 0),
    image.height - sh,
  )
  return { sx, sy, sw, sh }
}

const still = (x: number, y: number, a: number, b: number): ShotPlan => ({
  from: { x, y, zoom: a },
  to: { x, y, zoom: b },
})

/** A restrained set of moves for when the caller has no idea what is in the photo. */
export function defaultShots(count: number): ShotPlan[] {
  const moves: ShotPlan[] = [
    still(0.5, 0.5, 1.0, 1.12),
    {
      from: { x: 0.5, y: 0.62, zoom: 1.35 },
      to: { x: 0.5, y: 0.5, zoom: 1.35 },
    },
    {
      from: { x: 0.5, y: 0.38, zoom: 1.3 },
      to: { x: 0.5, y: 0.46, zoom: 1.5 },
    },
    {
      from: { x: 0.44, y: 0.5, zoom: 1.45 },
      to: { x: 0.56, y: 0.5, zoom: 1.45 },
    },
    still(0.5, 0.55, 1.5, 1.2),
    still(0.5, 0.5, 1.2, 1.0),
  ]
  return Array.from(
    { length: count },
    (_, i) => moves[i % moves.length] as ShotPlan,
  )
}
