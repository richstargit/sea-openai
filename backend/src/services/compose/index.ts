import { stat } from 'node:fs/promises'
import { defaultShots } from '@/services/compose/camera.js'
import {
  buildCaptionPages,
  cleanCaption,
  largestFittingFont,
  phrasesOf,
} from '@/services/compose/captions.js'
import { detectPauses, probeDuration } from '@/services/compose/ffmpeg.js'
import { thaiFontFamily } from '@/services/compose/fonts.js'
import {
  captionLayout,
  DEFAULT_THEME,
  loadImages,
  makeMeasure,
  renderClip,
} from '@/services/compose/render.js'
import { alignBeats } from '@/services/compose/timeline.js'
import type { ComposeInput, ComposeResult } from '@/services/compose/types.js'

export type { ComposeInput, ComposeResult } from '@/services/compose/types.js'

/**
 * Turns script beats, product photos and a finished voice take into one
 * portrait MP4 (H.264 plus AAC): the video is as long as the voice, every
 * shot ends when its sentence ends, and the spoken lines are burned in as
 * captions.
 */
export async function composeClip(input: ComposeInput): Promise<ComposeResult> {
  if (input.beats.length === 0) throw new Error('no beats to compose')
  if (input.images.length === 0) throw new Error('no images to compose')

  const width = input.width ?? 1080
  const height = input.height ?? 1920
  const fps = input.fps ?? 30
  const theme = {
    ...DEFAULT_THEME,
    fontFamily: thaiFontFamily(),
    ...input.theme,
  }

  const durationSec = await probeDuration(input.audioPath)
  const pauses = await detectPauses(input.audioPath, durationSec)
  const alignment = alignBeats(input.beats, pauses, durationSec)

  // One caption size for the whole clip: the largest at which no phrase has to be cut.
  const base = captionLayout(width, height)
  const fontPx = largestFittingFont(
    phrasesOf(alignment.beats.map((b) => b.text)),
    (px) => makeMeasure(theme.fontFamily, px),
    base.maxTextWidth,
    base.fontPx,
    Math.round(base.fontPx * 0.72),
  )
  const layout = captionLayout(width, height, fontPx)
  const pages = buildCaptionPages(
    alignment.beats,
    makeMeasure(theme.fontFamily, layout.fontPx),
    layout.maxTextWidth,
  )

  const images = await loadImages(input.images)
  const started = Date.now()
  const frames = await renderClip({
    width,
    height,
    fps,
    durationSec,
    timeline: alignment.beats,
    pages,
    shots: input.shots ?? defaultShots(input.beats.length),
    images,
    layout,
    title: input.title ? cleanCaption(input.title) : undefined,
    theme,
    audioPath: input.audioPath,
    outPath: input.outPath,
    onProgress: input.onProgress,
  })
  const size = (await stat(input.outPath)).size
  if (size === 0) throw new Error('the encoder wrote an empty file')

  return {
    path: input.outPath,
    durationSec,
    width,
    height,
    fps,
    frames,
    captionFontPx: layout.fontPx,
    renderSeconds: Math.round((Date.now() - started) / 100) / 10,
    method: alignment.method,
    pausesFound: alignment.pausesFound,
    meanShiftSec: alignment.meanShiftSec,
    timeline: alignment.beats,
    pages,
  }
}
