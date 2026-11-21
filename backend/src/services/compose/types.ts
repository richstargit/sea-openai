export type Beat = {
  /** Planned times from the script writer. Only used as a fallback hint. */
  startSec?: number
  endSec?: number
  voiceover: string
  imageIndex: number | null
}

/** A point on the photo (0 to 1 on each axis) and how far to zoom into it. */
export type Focus = { x: number; y: number; zoom: number }
export type ShotPlan = { from: Focus; to: Focus }

export type Pause = { start: number; end: number }

export type TimedBeat = {
  index: number
  startSec: number
  endSec: number
  text: string
  imageIndex: number
}

export type CaptionPage = {
  startSec: number
  endSec: number
  lines: string[]
}

export type AlignMethod = 'pauses' | 'proportional' | 'mixed'

export type Theme = {
  ink: string
  paper: string
  accent: string
  captionBg: string
  captionText: string
  fontFamily: string
}

export type ComposeInput = {
  beats: Beat[]
  /** File paths or encoded image bytes. */
  images: (string | Buffer)[]
  audioPath: string
  outPath: string
  /** Shown near the top during the first shot. */
  title?: string
  shots?: ShotPlan[]
  width?: number
  height?: number
  fps?: number
  theme?: Partial<Theme>
  onProgress?: (done: number, total: number) => void
}

export type ComposeResult = {
  path: string
  durationSec: number
  width: number
  height: number
  fps: number
  frames: number
  captionFontPx: number
  renderSeconds: number
  method: AlignMethod
  pausesFound: number
  /** Mean distance between each cut and where the character count alone would put it. */
  meanShiftSec: number
  timeline: TimedBeat[]
  pages: CaptionPage[][]
}
