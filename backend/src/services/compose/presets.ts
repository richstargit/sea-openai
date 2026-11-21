/**
 * Output sizes for the four video shapes, and the margins captions respect.
 *
 * Pixel sizes are what each platform asks for. The safe areas are OUR OWN
 * recommended caption margins (a share of the frame), chosen so text stays
 * clear of the interface each platform draws over a video. They are not
 * confirmed platform specifications.
 */

export const ASPECTS = ['9:16', '4:5', '1:1', '16:9'] as const
export type Aspect = (typeof ASPECTS)[number]

export const DEFAULT_ASPECT: Aspect = '9:16'

/** Percent of the frame kept clear of captions and the title, per side. */
export type SafeArea = {
  top: number
  bottom: number
  left: number
  right: number
}

export type Preset = {
  aspect: Aspect
  /** Where the shape is used, for people reading the code. */
  use: string
  width: number
  height: number
  safe: SafeArea
  /** Caption size relative to the 9:16 look (1 keeps it exactly as it was). */
  captionScale: number
  /** Share of the frame width a caption line may use at most, or null for the safe width. */
  captionMaxWidthPct: number | null
  /**
   * cover: the photo always fills the frame (cropped, never stretched).
   * auto: cover too, unless that would throw away much of the photo, then
   * the whole photo is shown on a blurred copy of itself.
   */
  fit: 'cover' | 'auto'
  /** How high the subject rides in the frame, above the caption box (0 top, 1 bottom). */
  subjectY: number
}

export const PRESETS: Record<Aspect, Preset> = {
  '9:16': {
    aspect: '9:16',
    use: 'TikTok, Reels, Shorts',
    width: 1080,
    height: 1920,
    safe: { top: 14, bottom: 25, left: 6, right: 6 },
    captionScale: 1,
    captionMaxWidthPct: null,
    // The first look of this product, so its crop never changes.
    fit: 'cover',
    subjectY: 0.4,
  },
  '4:5': {
    aspect: '4:5',
    use: 'Instagram and Facebook feed',
    width: 1080,
    height: 1350,
    safe: { top: 5, bottom: 8, left: 5, right: 5 },
    captionScale: 1,
    captionMaxWidthPct: null,
    fit: 'auto',
    subjectY: 0.44,
  },
  '1:1': {
    aspect: '1:1',
    use: 'Square posts',
    width: 1080,
    height: 1080,
    safe: { top: 6, bottom: 6, left: 6, right: 6 },
    captionScale: 1,
    captionMaxWidthPct: null,
    fit: 'auto',
    subjectY: 0.45,
  },
  '16:9': {
    aspect: '16:9',
    use: 'YouTube',
    width: 1920,
    height: 1080,
    safe: { top: 8, bottom: 10, left: 5, right: 5 },
    // A 1080 tall frame at the full size would shout.
    captionScale: 0.85,
    // Two lines across most of a 1920 wide frame are hard to read.
    captionMaxWidthPct: 58,
    fit: 'auto',
    subjectY: 0.5,
  },
}

export function isAspect(value: unknown): value is Aspect {
  return (ASPECTS as readonly string[]).includes(value as string)
}

export function presetFor(aspect: Aspect = DEFAULT_ASPECT): Preset {
  return PRESETS[aspect]
}

/** Demo mode renders a third of the size, so nothing heavy runs for free. */
export const DEMO_DIVISOR = 3

export function frameSize(
  aspect: Aspect,
  demo = false,
): { width: number; height: number } {
  const { width, height } = PRESETS[aspect]
  return demo
    ? { width: width / DEMO_DIVISOR, height: height / DEMO_DIVISOR }
    : { width, height }
}

/** The safe area in pixels, and the bottom edge captions sit on. */
export function safeBox(
  safe: SafeArea,
  width: number,
  height: number,
): { left: number; right: number; top: number; captionBottom: number } {
  return {
    left: Math.round((width * safe.left) / 100),
    right: Math.round((width * safe.right) / 100),
    top: Math.round((height * safe.top) / 100),
    captionBottom: Math.round(height - (height * safe.bottom) / 100),
  }
}

/** Everything sized in pixels grows with the frame. 1 means a 720 wide 9:16 frame. */
export function unitScale(width: number, height: number): number {
  return Math.min(width, height) / 720
}
