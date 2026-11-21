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

/** Share of the photo that a cover crop keeps on screen (1 means all of it). */
export function coverVisibleShare(
  image: { width: number; height: number },
  view: { width: number; height: number },
): number {
  const cover = Math.max(view.width / image.width, view.height / image.height)
  return (
    ((view.width / cover) * (view.height / cover)) /
    (image.width * image.height)
  )
}

/**
 * Below this share a cover crop throws away too much of the photo, and it
 * also has to be enlarged much more than showing the whole photo would
 * (a portrait photo in a 16:9 frame keeps about a third of its height).
 */
export const MIN_VISIBLE_SHARE = 0.6

/**
 * In a frame that already crops the photo, a zoom and a camera move on top
 * of that can cut the product apart. The middle 60 percent of the photo
 * (where a product photo keeps its subject) stays on screen on both axes
 * for as long as the crop window allows it, and the zoom is capped so that
 * it always does. 9:16 keeps its original camera and does not use this.
 */
export const MIN_SUBJECT_BAND = 0.6

/** The share of the photo's width and height that a cover crop shows at zoom one. */
function windowShare(
  image: { width: number; height: number },
  view: { width: number; height: number },
): { x: number; y: number } {
  const cover = Math.max(view.width / image.width, view.height / image.height)
  return {
    x: Math.min(1, view.width / cover / image.width),
    y: Math.min(1, view.height / cover / image.height),
  }
}

export function limitZoom(
  focus: Focus,
  image: { width: number; height: number },
  view: { width: number; height: number },
): Focus {
  const share = windowShare(image, view)
  const room = Math.min(share.x, share.y) / MIN_SUBJECT_BAND
  return { ...focus, zoom: Math.min(focus.zoom, Math.max(1, room)) }
}

/** `sourceRect` for a shape that already crops: capped zoom, subject band kept on screen. */
export function framedRect(
  focus: Focus,
  image: { width: number; height: number },
  view: { width: number; height: number },
  anchor: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { sx: number; sy: number; sw: number; sh: number } {
  const r = sourceRect(limitZoom(focus, image, view), image, view, anchor)
  const lo = (1 - MIN_SUBJECT_BAND) / 2
  const hi = 1 - lo
  const place = (start: number, size: number, total: number) => {
    const keep =
      size >= MIN_SUBJECT_BAND * total - 1e-6
        ? Math.min(Math.max(start, hi * total - size), lo * total)
        : total / 2 - size / 2
    return Math.min(Math.max(keep, 0), total - size)
  }
  return {
    ...r,
    sx: place(r.sx, r.sw, image.width),
    sy: place(r.sy, r.sh, image.height),
  }
}

export type Framing = 'cover' | 'contain'

/** `cover` always fills the frame. `auto` falls back to `contain` when cover would lose too much. */
export function chooseFraming(
  fit: 'cover' | 'auto',
  image: { width: number; height: number },
  view: { width: number; height: number },
): Framing {
  if (fit === 'cover') return 'cover'
  return coverVisibleShare(image, view) < MIN_VISIBLE_SHARE
    ? 'contain'
    : 'cover'
}

/** The camera zoom is softened in contain framing, and never goes past this. */
export const MAX_CONTAIN_ZOOM = 1.2
const CONTAIN_ZOOM_SHARE = 0.35

/**
 * Where to draw the whole photo, at one scale on both axes (never stretched).
 * The scale starts at "fits entirely" and grows by at most 20 percent with the
 * camera move, so the enlargement stays modest. Along an axis where the photo
 * is smaller than the frame it stays centred (the backdrop shows around it);
 * along an axis where it is larger, it pans toward the focus point but never
 * leaves a gap. The subject therefore never leaves the frame.
 */
export function containRect(
  focus: Focus,
  image: { width: number; height: number },
  view: { width: number; height: number },
  anchor: { x: number; y: number } = { x: 0.5, y: 0.5 },
): { dx: number; dy: number; dw: number; dh: number; scale: number } {
  const fit = Math.min(view.width / image.width, view.height / image.height)
  const zoom = Math.min(
    MAX_CONTAIN_ZOOM,
    1 + (Math.max(1, focus.zoom) - 1) * CONTAIN_ZOOM_SHARE,
  )
  const scale = fit * zoom
  const dw = image.width * scale
  const dh = image.height * scale
  const place = (size: number, span: number, f: number, a: number) =>
    size >= span
      ? Math.min(0, Math.max(span - size, a * span - f * size))
      : (span - size) / 2
  return {
    dx: place(dw, view.width, focus.x, anchor.x),
    dy: place(dh, view.height, focus.y, anchor.y),
    dw,
    dh,
    scale,
  }
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
