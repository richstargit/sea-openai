import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { createCanvas, type Image, loadImage } from '@napi-rs/canvas'

import { childEnv, hookMachineConfig } from '@/config/hook-machine.config.js'

import { cameraAt, sourceRect } from '@/services/compose/camera.js'
import { buildEncodeArgs } from '@/services/compose/ffmpeg.js'
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

/** Phone apps cover the top fifth and the bottom quarter, and buttons sit on the right. */
export function safeArea(width: number, height: number) {
  return {
    left: Math.round(width * 0.085),
    right: Math.round(width * 0.085),
    top: Math.round(height * 0.12),
    captionBottom: Math.round(height * 0.74),
  }
}

export type CaptionLayout = {
  fontPx: number
  linePx: number
  maxTextWidth: number
}

export function captionLayout(
  width: number,
  height: number,
  fontSize?: number,
): CaptionLayout {
  const area = safeArea(width, height)
  const fontPx = fontSize ?? Math.round(width * 0.058)
  return {
    fontPx,
    linePx: Math.round(fontPx * 1.42),
    maxTextWidth: width - area.left - area.right - Math.round(width * 0.09),
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

export async function renderClip(plan: RenderPlan): Promise<number> {
  const { width, height, fps, theme } = plan
  const total = Math.round(plan.durationSec * fps)
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  const area = safeArea(width, height)
  const layout = plan.layout

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
    const r = sourceRect(
      cameraAt(shot, progress),
      image,
      { width, height },
      { x: 0.5, y: 0.4 },
    )
    ctx.drawImage(image, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height)

    // A soft shade under the captions keeps white text readable on a bright photo.
    const shade = ctx.createLinearGradient(
      0,
      height * 0.5,
      0,
      area.captionBottom + 140,
    )
    shade.addColorStop(0, 'rgba(20,14,8,0)')
    shade.addColorStop(1, 'rgba(20,14,8,0.42)')
    ctx.fillStyle = shade
    ctx.fillRect(0, height * 0.5, width, height - height * 0.5)

    // Progress line along the top edge.
    ctx.fillStyle = theme.accent
    ctx.fillRect(0, 0, Math.round(width * (t / plan.durationSec)), 6)

    // Product name, during the first shot only.
    if (plan.title && bi === 0) {
      const fade = Math.min(1, t / 0.25, (beat.endSec - t) / 0.25)
      ctx.globalAlpha = Math.max(0, fade)
      ctx.font = `700 ${Math.round(width * 0.042)}px ${theme.fontFamily}`
      const w = ctx.measureText(plan.title).width
      const padX = 34
      const h = Math.round(width * 0.042 * 1.9)
      ctx.fillStyle = theme.paper
      roundedRect(ctx, area.left, area.top, w + padX * 2, h, h / 2)
      ctx.fill()
      ctx.fillStyle = theme.ink
      ctx.textBaseline = 'middle'
      ctx.fillText(plan.title, area.left + padX, area.top + h / 2 + 2)
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
      const boxW = Math.min(
        width - area.left - area.right,
        Math.max(...widths) + 76,
      )
      const boxH = layout.linePx * page.lines.length + 52
      const boxX = (width - boxW) / 2
      const boxY = area.captionBottom - boxH + (1 - lead) * 14
      ctx.fillStyle = theme.captionBg
      roundedRect(ctx, boxX, boxY, boxW, boxH, 36)
      ctx.fill()
      ctx.fillStyle = theme.captionText
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      page.lines.forEach((line, i) => {
        ctx.fillText(
          line,
          width / 2,
          boxY + 26 + layout.linePx * (i + 1) - layout.linePx * 0.28,
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
