/**
 * The only file that knows how the clip composer (services/compose) is
 * called. If its signature changes, this adapter is the one place to touch.
 */

import {
  type Aspect,
  DEFAULT_ASPECT,
  frameSize,
} from '@/services/compose/presets.js'

export type ComposeRequest = {
  /** The spoken lines, already in the voice language, in order. */
  beats: { voiceover: string; imageIndex: number | null }[]
  /** Encoded image bytes (png, jpeg or webp). Never empty. */
  images: Buffer[]
  audioPath: string
  outPath: string
  title?: string
  /** The video shape and the exact pixel size to render (the demo size when mock). */
  aspect: Aspect
  width: number
  height: number
  /** Demo mode renders a small, fast clip so nothing heavy runs for free. */
  mock: boolean
  onProgress?: (done: number, total: number) => void
}

export type ComposeOutcome = { path: string; durationSec: number }

export type Composer = (request: ComposeRequest) => Promise<ComposeOutcome>

let override: Composer | null = null

/** Tests swap the composer, so no real encoder runs. Pass null to restore. */
export function setComposerForTests(composer: Composer | null): void {
  override = composer
}

const REAL_FPS = 30
// Demo mode keeps the cheap path: a third of the size and fewer frames.
const MOCK_FPS = 12

/** The pixel size a job renders at: the real size of the shape, or a third of it in demo mode. */
export const renderSize = (aspect: Aspect, mock: boolean) =>
  frameSize(aspect, mock)

export { DEFAULT_ASPECT }

export const composer: Composer = async (request) => {
  if (override) return override(request)

  // Loaded on demand so a problem inside the composer cannot stop the server booting.
  const { composeClip } = await import('@/services/compose/index.js')
  const result = await composeClip({
    beats: request.beats,
    images: request.images,
    audioPath: request.audioPath,
    outPath: request.outPath,
    title: request.title,
    aspect: request.aspect,
    width: request.width,
    height: request.height,
    fps: request.mock ? MOCK_FPS : REAL_FPS,
    onProgress: request.onProgress,
  })
  return { path: result.path, durationSec: result.durationSec }
}

/** A plain product card for the case where the user gave only text. */
export async function placeholderImage(title: string): Promise<Buffer> {
  const { createCanvas } = await import('@napi-rs/canvas')
  const { thaiFontFamily } = await import('@/services/compose/fonts.js')
  const width = 1080
  const height = 1350
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fafaf6'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#242421'
  ctx.font = `700 84px ${thaiFontFamily()}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // Thai has no spaces, so wrap by measuring characters.
  const lines: string[] = []
  let line = ''
  for (const char of Array.from(title.trim() || ' ')) {
    if (ctx.measureText(line + char).width > width - 200 && line) {
      lines.push(line)
      line = char
    } else {
      line += char
    }
  }
  lines.push(line)
  const shown = lines.slice(0, 5)
  const lineHeight = 120
  const top = height / 2 - ((shown.length - 1) * lineHeight) / 2
  for (const [i, text] of shown.entries()) {
    ctx.fillText(text, width / 2, top + i * lineHeight)
  }
  return canvas.toBuffer('image/png')
}
