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
import { frameSize, presetFor } from '@/services/compose/presets.js'
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
 * MP4 in one of four shapes (H.264 plus AAC): the video is as long as the voice, every
 * shot ends when its sentence ends, and the spoken lines are burned in as
 * captions.
 */
export async function composeClip(input: ComposeInput): Promise<ComposeResult> {
  if (input.beats.length === 0) throw new Error('no beats to compose')
  if (input.images.length === 0) throw new Error('no images to compose')

  if ((input.width === undefined) !== (input.height === undefined)) {
    throw new Error('give both width and height, or neither')
  }
  const basePreset = presetFor(input.aspect)
  const preset = { ...basePreset, safe: input.safeArea ?? basePreset.safe }
  const shape = frameSize(preset.aspect)
  const width = input.width ?? shape.width
  const height = input.height ?? shape.height
  // H.264 with yuv420p needs even sides.
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error('width and height must be even numbers')
  }
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
  const base = captionLayout(width, height, undefined, preset)
  const fontPx = largestFittingFont(
    phrasesOf(alignment.beats.map((b) => b.text)),
    (px) => makeMeasure(theme.fontFamily, px),
    base.maxTextWidth,
    base.fontPx,
    Math.round(base.fontPx * 0.72),
  )
  const layout = captionLayout(width, height, fontPx, preset)
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
    preset,
    title: input.title ? cleanCaption(input.title) : undefined,
    theme,
    audioPath: input.audioPath,
    outPath: input.outPath,
    onProgress: input.onProgress,
  })
  const size = (await stat(input.outPath)).size
  if (size === 0) throw new Error('the encoder wrote an empty file')

  return {
    aspect: preset.aspect,
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
