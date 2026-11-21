import type { Image, SKRSContext2D } from '@napi-rs/canvas'
import {
  colors,
  type PortraitShot,
  type VideoBrief,
} from '@/services/video/brief.js'

const defaultShots: [PortraitShot, PortraitShot, PortraitShot] = [
  {
    framing: 'detail',
    camera: 'pull',
    focusX: 0.5,
    focusY: 0.49,
    copy: 'subtitle',
    placement: 'bottom',
  },
  {
    framing: 'medium',
    camera: 'pan',
    focusX: 0.5,
    focusY: 0.45,
    copy: 'title',
    placement: 'top',
  },
  {
    framing: 'full',
    camera: 'pull',
    focusX: 0.5,
    focusY: 0.5,
    copy: 'lockup',
    placement: 'bottom',
  },
]
const shotStarts = [0, 1.6, 3.5] as const
const shotEnds = [1.6, 3.5, 6] as const
const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

function paintBackdrop(
  ctx: SKRSContext2D,
  accent: string,
  focusX: number,
  focusY: number,
  phase: number,
) {
  const { width, height } = ctx.canvas
  ctx.fillStyle = '#13161b'
  ctx.fillRect(0, 0, width, height)
  const x = (0.16 + focusX * 0.75 + phase * 0.08) * width
  const y = (0.12 + focusY * 0.63) * height
  const light = ctx.createRadialGradient(x, y, 0, x, y, height * 0.88)
  light.addColorStop(0, accent)
  light.addColorStop(0.38, `${accent}7a`)
  light.addColorStop(1, `${accent}00`)
  ctx.fillStyle = light
  ctx.fillRect(0, 0, width, height)
}

function drawShot(
  ctx: SKRSContext2D,
  image: Image,
  shot: PortraitShot,
  phase: number,
) {
  const { width, height } = ctx.canvas
  const fill = Math.max(width / image.width, height / image.height)
  const fit = Math.min(width / image.width, height / image.height)
  const base =
    shot.framing === 'full'
      ? fill / fit < 1.25
        ? fill
        : fit
      : fill * (shot.framing === 'detail' ? 1.85 : 1.22)
  const zoom =
    shot.camera === 'pan'
      ? 1.05
      : 1 + 0.12 * (shot.camera === 'push' ? phase : 1 - phase)
  const w = image.width * base * zoom
  const h = image.height * base * zoom
  const targetX =
    width * (0.5 + (shot.camera === 'pan' ? (phase - 0.5) * 0.18 : 0))
  const targetY = height * (shot.placement === 'top' ? 0.54 : 0.46)
  const x =
    w <= width
      ? (width - w) / 2
      : clamp(targetX - w * shot.focusX, width - w, 0)
  const y =
    h <= height
      ? (height - h) / 2
      : clamp(targetY - h * shot.focusY, height - h, 0)
  ctx.drawImage(image, x, y, w, h)
}

function wrap(ctx: SKRSContext2D, text: string, limit: number) {
  const lines: string[] = []
  let line = ''
  for (const { segment } of words.segment(text.trim())) {
    if (ctx.measureText(line + segment).width > limit && line.trim()) {
      lines.push(line.trim())
      line = ''
    }
    for (const { segment: char } of graphemes.segment(segment)) {
      if (line && ctx.measureText(line + char).width > limit) {
        lines.push(line.trim())
        line = ''
      }
      line += char
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines
}

export function drawPortrait(
  ctx: SKRSContext2D,
  brief: VideoBrief,
  image: Image | undefined,
  time: number,
) {
  const { width, height } = ctx.canvas
  const index = time < shotEnds[0] ? 0 : time < shotEnds[1] ? 1 : 2
  const start = shotStarts[index]
  const duration = shotEnds[index] - start
  const shot = brief.shots?.[index] ?? defaultShots[index]
  const elapsed = time - start
  const phase = Math.sin((Math.min(1, elapsed / duration) * Math.PI) / 2)
  paintBackdrop(ctx, colors[brief.color], shot.focusX, shot.focusY, phase)
  if (image) drawShot(ctx, image, shot, phase)
  const copy = !image && shot.copy === 'none' ? 'title' : shot.copy
  if (copy === 'none') return
  const bottom = shot.placement === 'bottom'
  const shade = ctx.createLinearGradient(
    0,
    bottom ? height : 0,
    0,
    bottom ? 0 : height,
  )
  shade.addColorStop(0, '#131116d9')
  shade.addColorStop(0.27, '#1311168c')
  shade.addColorStop(0.62, '#13111600')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, width, height)
  const inset = width * 0.085
  const limit = width - 2 * inset
  const headline =
    copy === 'subtitle' ? brief.subtitle || brief.title : brief.title
  const editorial = brief.typeface === 'editorial'
  const family = editorial
    ? '"Didot", "Noto Serif Thai", serif'
    : '"Helvetica Neue", "Thonburi", sans-serif'
  let size = headline.length > 32 ? 64 : 86
  let lines: string[]
  for (;;) {
    ctx.font = `${editorial ? 500 : 650} ${size}px ${family}`
    lines = wrap(ctx, headline, limit)
    if (lines.length <= 3 || size <= 40) break
    size -= 4
  }
  const titleFont = ctx.font
  const subtitleFont = '400 32px "Helvetica Neue", "Thonburi", sans-serif'
  ctx.font = subtitleFont
  const supporting = copy === 'lockup' ? wrap(ctx, brief.subtitle, limit) : []
  const leading = size * 1.16
  const blockHeight =
    lines.length * leading +
    (supporting.length ? 19 + supporting.length * 43 : 0)
  const firstY = bottom ? height * 0.9 - blockHeight : height * 0.1
  const reveal = 1 - (1 - clamp(elapsed / 0.42, 0, 1)) ** 3
  ctx.save()
  ctx.translate(inset, firstY)
  ctx.globalAlpha = reveal
  ctx.translate(0, (1 - reveal) * 28)
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#fffaf1'
  ctx.font = titleFont
  for (const [i, line] of lines.entries()) ctx.fillText(line, 0, i * leading)
  ctx.font = subtitleFont
  for (const [i, line] of supporting.entries())
    ctx.fillText(line, 0, lines.length * leading + 19 + i * 43)
  ctx.restore()
}
