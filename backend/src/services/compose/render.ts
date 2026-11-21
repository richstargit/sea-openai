import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { createCanvas, type Image, loadImage } from '@napi-rs/canvas'

import { childEnv, hookMachineConfig } from '@/config/hook-machine.config.js'

import {
  cameraAt,
  chooseFraming,
  containRect,
  sourceRect,
} from '@/services/compose/camera.js'
import { buildEncodeArgs } from '@/services/compose/ffmpeg.js'
import {
  PRESETS,
  type Preset,
  type SafeArea,
  safeBox,
  unitScale,
} from '@/services/compose/presets.js'
import type {
  CaptionPage,
  ShotPlan,
  Theme,
  TimedBeat,
} from '@/services/compose/types.js'

export const DEFAULT_THEME: Omit<Theme, 'fontFamily'> = {
  ink: '#1d1d1f',
  paper: '#fafaf6',
  accent: '#ff963f',
  captionBg: 'rgba(24, 20, 16, 0.74)',
  captionText: '#ffffff',
}

export type CaptionLayout = {
  fontPx: number
  linePx: number
  maxTextWidth: number
}

/**
 * Caption size and line width for one shape. The size grows with the frame
 * (a 720 wide 9:16 frame is the reference, so that look is unchanged), and
 * the line width is what the safe area leaves, so Thai wraps to the room
 * each shape really has.
 */
export function captionLayout(
  width: number,
  height: number,
  fontSize?: number,
  preset: Preset = PRESETS['9:16'],
): CaptionLayout {
  const k = unitScale(width, height)
  const box = safeBox(preset.safe, width, height)
  const fontPx =
    fontSize ??
    Math.round(Math.min(width, height) * 0.058 * preset.captionScale)
  const room = width - box.left - box.right
  const cap =
    preset.captionMaxWidthPct === null
      ? room
      : Math.min(room, Math.round((width * preset.captionMaxWidthPct) / 100))
  return {
    fontPx,
    linePx: Math.round(fontPx * 1.42),
    // The caption box adds its own padding on both sides.
    maxTextWidth: cap - Math.round(76 * k),
  }
}

/** Where the caption box sits, in pixels. `lead` is 0 to 1 while a page eases in. */
export function captionBox(
  width: number,
  height: number,
  safe: SafeArea,
  layout: CaptionLayout,
  lineWidths: number[],
  lead = 1,
): { x: number; y: number; w: number; h: number; radius: number } {
  const k = unitScale(width, height)
  const edge = safeBox(safe, width, height)
  const w = Math.min(
    width - edge.left - edge.right,
    Math.max(...lineWidths) + Math.round(76 * k),
  )
  const h = layout.linePx * lineWidths.length + Math.round(52 * k)
  return {
    x: (width - w) / 2,
    y: edge.captionBottom - h + (1 - lead) * 14 * k,
    w,
    h,
    radius: Math.round(36 * k),
  }
}

export function makeMeasure(fontFamily: string, fontPx: number) {
  const canvas = createCanvas(16, 16)
  const ctx = canvas.getContext('2d')
  ctx.font = `700 ${fontPx}px ${fontFamily}`
  return (text: string) => ctx.measureText(text).width
}

type RenderPlan = {
  width: number
  height: number
  fps: number
  durationSec: number
  timeline: TimedBeat[]
  pages: CaptionPage[][]
  shots: ShotPlan[]
  images: Image[]
  layout: CaptionLayout
  preset: Preset
  title?: string
  theme: Theme
  audioPath: string
  outPath: string
  onProgress?: (done: number, total: number) => void
}

function roundedRect(
  ctx: ReturnType<ReturnType<typeof createCanvas>['getContext']>,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function loadImages(
  sources: (string | Buffer)[],
): Promise<Image[]> {
  return Promise.all(sources.map((s) => loadImage(s)))
}

/** The photo, enlarged to fill the frame and blurred, for the sides of a photo that does not. */
function makeBackdrop(image: Image, width: number, height: number) {
  const small = createCanvas(
    Math.max(8, Math.round(width / 32)),
    Math.max(8, Math.round(height / 32)),
  )
  const sctx = small.getContext('2d')
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = 'high'
  const cover = Math.max(small.width / image.width, small.height / image.height)
  const sw = small.width / cover
  const sh = small.height / cover
  sctx.drawImage(
    image,
    (image.width - sw) / 2,
    (image.height - sh) / 2,
    sw,
    sh,
    0,
    0,
    small.width,
    small.height,
  )
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  // Scaling the tiny copy back up is the blur.
  ctx.drawImage(small, 0, 0, width, height)
  ctx.fillStyle = 'rgba(20, 14, 8, 0.22)'
  ctx.fillRect(0, 0, width, height)
  return canvas
}

export async function renderClip(plan: RenderPlan): Promise<number> {
  const { width, height, fps, theme } = plan
  const total = Math.round(plan.durationSec * fps)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const area = safeBox(plan.preset.safe, width, height)
  const k = unitScale(width, height)
  const unit = Math.min(width, height)
  const layout = plan.layout
  const view = { width, height }
  const backdrops = new Map<Image, ReturnType<typeof makeBackdrop>>()

  await mkdir(path.dirname(plan.outPath), { recursive: true })
  const ffmpeg = spawn(
    hookMachineConfig.ffmpegBin,
    buildEncodeArgs({
      width,
      height,
      fps,
      audioPath: plan.audioPath,
      outPath: plan.outPath,
      durationSec: plan.durationSec,
    }),
    { env: childEnv(), stdio: ['pipe', 'ignore', 'pipe'] },
  )
  let stderr = ''
  ffmpeg.stderr.on('data', (chunk) => {
    stderr += String(chunk)
  })
  const exited = new Promise<void>((resolve, reject) => {
    ffmpeg.on('error', reject)
    ffmpeg.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-400)}`)),
    )
  })
  // A closed pipe surfaces through `exited`; ignore the write error here.
  ffmpeg.stdin.on('error', () => undefined)

  const beatAt = (t: number) => {
    const found = plan.timeline.findIndex(
      (b) => t >= b.startSec && t < b.endSec,
    )
    return found === -1 ? plan.timeline.length - 1 : found
  }

  for (let frame = 0; frame < total; frame++) {
    const t = frame / fps
    const bi = beatAt(t)
    const beat = plan.timeline[bi]
    if (!beat) break
    const image = plan.images[beat.imageIndex] ?? plan.images[0]
    if (!image) throw new Error('no image for this shot')

    // Photo with the camera move for this shot.
    const progress =
      (t - beat.startSec) / Math.max(0.001, beat.endSec - beat.startSec)
    const shot = plan.shots[bi] ?? plan.shots[0]
    if (!shot) throw new Error('no camera plan')
    // The subject rides above the caption box, which sits low in the safe area.
    const focus = cameraAt(shot, progress)
    const anchor = { x: 0.5, y: plan.preset.subjectY }
    if (chooseFraming(plan.preset.fit, image, view) === 'cover') {
      const r = sourceRect(focus, image, view, anchor)
      ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height)
    } else {
      // The whole photo on a blurred copy of itself, so nothing is cropped away or stretched.
      let backdrop = backdrops.get(image)
      if (!backdrop) {
        backdrop = makeBackdrop(image, width, height)
        backdrops.set(image, backdrop)
      }
      ctx.drawImage(backdrop, 0, 0)
      const r = containRect(focus, image, view, anchor)
      ctx.drawImage(image, r.dx, r.dy, r.dw, r.dh)
    }

    // A soft shade under the captions keeps white text readable on a bright photo.
    const shade = ctx.createLinearGradient(
      0,
      height * 0.5,
      0,
      area.captionBottom + 140 * k,
    )
    shade.addColorStop(0, 'rgba(20,14,8,0)')
    shade.addColorStop(1, 'rgba(20,14,8,0.42)')
    ctx.fillStyle = shade
    ctx.fillRect(0, height * 0.5, width, height - height * 0.5)

    // Progress line along the top edge.
    ctx.fillStyle = theme.accent
    ctx.fillRect(
      0,
      0,
      Math.round(width * (t / plan.durationSec)),
      Math.max(4, Math.round(6 * k)),
    )

    // Product name, during the first shot only.
    if (plan.title && bi === 0) {
      const fade = Math.min(1, t / 0.25, (beat.endSec - t) / 0.25)
      ctx.globalAlpha = Math.max(0, fade)
      const padX = Math.round(34 * k)
      // A long name shrinks until it fits inside the safe area.
      let titlePx = Math.round(unit * 0.042)
      ctx.font = `700 ${titlePx}px ${theme.fontFamily}`
      let w = ctx.measureText(plan.title).width
      const room = width - area.left - area.right - padX * 2
      if (w > room) {
        titlePx = Math.max(
          Math.round(titlePx * 0.6),
          Math.floor(titlePx * (room / w)),
        )
        ctx.font = `700 ${titlePx}px ${theme.fontFamily}`
        w = Math.min(ctx.measureText(plan.title).width, room)
      }
      const h = Math.round(titlePx * 1.9)
      ctx.fillStyle = theme.paper
      roundedRect(ctx, area.left, area.top, w + padX * 2, h, h / 2)
      ctx.fill()
      ctx.fillStyle = theme.ink
      ctx.textBaseline = 'middle'
      ctx.fillText(plan.title, area.left + padX, area.top + h / 2 + 2 * k, room)
      ctx.globalAlpha = 1
    }

    // Captions: at most two lines, centred, bottom edge inside the safe area.
    const page = (plan.pages[bi] ?? []).find(
      (p) => t >= p.startSec && t < p.endSec,
    )
    if (page && page.lines.length > 0) {
      const lead = Math.min(1, (t - page.startSec) / 0.14)
      ctx.globalAlpha = Math.max(0, lead)
      ctx.font = `700 ${layout.fontPx}px ${theme.fontFamily}`
      const widths = page.lines.map((l) => ctx.measureText(l).width)
      const box = captionBox(
        width,
        height,
        plan.preset.safe,
        layout,
        widths,
        lead,
      )
      ctx.fillStyle = theme.captionBg
      roundedRect(ctx, box.x, box.y, box.w, box.h, box.radius)
      ctx.fill()
      ctx.fillStyle = theme.captionText
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      page.lines.forEach((line, i) => {
        ctx.fillText(
          line,
          width / 2,
          box.y + 26 * k + layout.linePx * (i + 1) - layout.linePx * 0.28,
        )
      })
      ctx.textAlign = 'start'
      ctx.globalAlpha = 1
    }

    const ok = ffmpeg.stdin.write(canvas.data())
    if (!ok)
      await new Promise<void>((resolve) => ffmpeg.stdin.once('drain', resolve))
    if (frame % 30 === 0) plan.onProgress?.(frame, total)
  }
  ffmpeg.stdin.end()
  await exited
  plan.onProgress?.(total, total)
  return total
}
