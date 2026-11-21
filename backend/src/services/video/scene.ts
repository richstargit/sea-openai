import { createCanvas, type Image, type SKRSContext2D } from '@napi-rs/canvas'
import { z } from 'zod'
import type { VideoBrief } from '@/services/video/brief.js'
import { select } from '@/services/video/direction.js'
import { wrap } from '@/services/video/portrait.js'

const coord = z.number().min(0).max(1)
const extent = z.number().min(0.02).max(1)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const box = { x: coord, y: coord, width: extent, height: extent }
const picture = z.strictObject({
  ...box,
  asset: z.int().min(0).max(7),
  focusX: coord,
  focusY: coord,
  fromZoom: z.number().min(1).max(3),
  toZoom: z.number().min(1).max(3),
  panX: z.number().min(-0.35).max(0.35),
  panY: z.number().min(-0.35).max(0.35),
  reveal: z.enum(['cut', 'wipe', 'rise']),
})
const typeLayer = z.strictObject({
  text: z.string().trim().min(1).max(90),
  x: coord,
  y: coord,
  width: extent,
  size: z.number().min(22).max(140),
  ink: color,
  serif: z.boolean(),
  align: z.enum(['left', 'center', 'right']),
})
const scene = z.strictObject({
  paper: color,
  transition: z.enum(['cut', 'dissolve', 'wipe']),
  pictures: z.array(picture).max(3),
  type: z.array(typeLayer).max(3),
})
export type FilmScene = z.infer<typeof scene>
const ease = (value: number) => 1 - (1 - Math.min(1, Math.max(0, value))) ** 3
const cropOffset = (position: number, span: number, content: number) =>
  Math.max(span - content, Math.min(0, position))

export function drawScene(
  ctx: SKRSContext2D,
  scene: FilmScene,
  images: Image[],
  phase: number,
  elapsed: number,
) {
  const w = ctx.canvas.width
  const h = ctx.canvas.height
  ctx.fillStyle = scene.paper
  ctx.fillRect(0, 0, w, h)
  for (const layer of scene.pictures) {
    const photo = images[layer.asset]
    if (!photo) continue
    const bw = w * layer.width
    const bh = h * layer.height
    const t = phase * phase * (3 - 2 * phase)
    const scale =
      Math.max(bw / photo.width, bh / photo.height) *
      (layer.fromZoom + (layer.toZoom - layer.fromZoom) * t)
    const dw = photo.width * scale
    const dh = photo.height * scale
    const dx = cropOffset(bw / 2 - (layer.focusX + layer.panX * t) * dw, bw, dw)
    const dy = cropOffset(bh / 2 - (layer.focusY + layer.panY * t) * dh, bh, dh)
    const reveal = ease(elapsed / 0.42)
    ctx.save()
    ctx.translate(w * layer.x, h * layer.y)
    ctx.beginPath()
    ctx.rect(0, 0, layer.reveal === 'wipe' ? bw * reveal : bw, bh)
    ctx.clip()
    ctx.drawImage(
      photo,
      dx,
      dy + (layer.reveal === 'rise' ? (1 - reveal) * 0.07 * bh : 0),
      dw,
      dh,
    )
    ctx.restore()
  }
  scene.type.forEach((layer, i) => {
    const reveal = ease((elapsed - i * 0.09) / 0.35)
    const lineWidth = Math.min(layer.width, 1 - layer.x) * w
    if (lineWidth < 1) return
    ctx.save()
    ctx.globalAlpha = reveal
    ctx.fillStyle = layer.ink
    ctx.textAlign = layer.align
    ctx.textBaseline = 'top'
    const offset =
      layer.align === 'center'
        ? lineWidth / 2
        : layer.align === 'right'
          ? lineWidth
          : 0
    const family = layer.serif
      ? '500 SIZEpx "Didot", "Noto Serif Thai", serif'
      : '600 SIZEpx "Helvetica Neue", "Thonburi", sans-serif'
    let size = layer.size
    let lines: string[]
    for (;;) {
      ctx.font = family.replace('SIZE', String(size))
      lines = wrap(ctx, layer.text, lineWidth)
      if (layer.y * h + lines.length * size * 1.15 <= h || size <= 22) break
      size -= 2
    }
    const top = Math.min(layer.y * h, h - lines.length * size * 1.15)
    for (const [n, line] of lines.entries()) {
      ctx.fillText(
        line,
        layer.x * w + offset,
        top + n * size * 1.15 + (1 - reveal) * 18,
      )
    }
    ctx.restore()
  })
}

function preview(image: Image) {
  const scale = Math.min(1, 512 / Math.max(image.width, image.height))
  const canvas = createCanvas(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  )
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export async function directScenes(
  brief: VideoBrief,
  photos: Image[],
  signal: AbortSignal,
) {
  const beats = brief.beats ?? []
  const material = photos.map(preview)
  const context = JSON.stringify({
    title: brief.title,
    subtitle: brief.subtitle,
    look: brief.look,
    typeface: brief.typeface,
    beats,
  })
  const validScene = scene.extend({
    pictures: z
      .array(
        picture.extend({
          asset: z
            .int()
            .min(0)
            .max(Math.max(0, photos.length - 1)),
        }),
      )
      .max(photos.length ? 3 : 0),
  })
  const result = await select(
    'compose_film',
    z.strictObject({ scenes: z.array(validScene).length(beats.length) }),
    [
      'Design each storyboard beat as a distinct portrait composition using the ACTUAL photographs supplied in zero-based order. You are designing every frame on a 720 x 1280 canvas.',
      'Build purposeful cuts and match composition across scenes. Open on an arresting subject, intercut a change of scale, a tactile detail and a human moment, and close on the recognizable hero. Give each piece its own art direction. Visualize the specific brief, do not add default captions, badges or scene numbers. Never invent claims.',
      'Images and text are independent animated layers. x/y are the TOP LEFT of the viewport or text box, width/height are fractions. For a full bleed use (0,0,1,1). Layered images paint in order. Focus coordinates are measured inside the ORIGINAL image. Camera moves from fromZoom to toZoom and pans by panX/Y. For packshots keep the label intact, respect safe areas. When an angle already exists in a supplied picture, use it.',
      'Use short type in the actual negative space of a photograph or in a deliberate paper margin. Expressive scale, varied panel geometry and confident restraint. Use a legible ink color and generous contrast. Silent visual beats often need no type. When there are no images design each beat with typography. paper and ink are six-digit hex colors. All type must fit within the canvas.',
    ].join(' '),
    [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: context },
          ...material.map((image_url) => ({
            type: 'input_image' as const,
            detail: 'low' as const,
            image_url,
          })),
        ],
      },
    ],
    signal,
    6800,
  )

  const thumb = createCanvas(720, 1280)
  const sheet = createCanvas(
    180 * Math.min(4, beats.length),
    320 * Math.ceil(beats.length / 4),
  )
  result.scenes.forEach((design, i) => {
    drawScene(thumb.getContext('2d'), design, photos, 0.5, 1)
    sheet
      .getContext('2d')
      .drawImage(thumb, (i % 4) * 180, Math.floor(i / 4) * 320, 180, 320)
  })
  const reviewed = await select(
    'review_film_frames',
    z.strictObject({
      fixes: z
        .array(
          z.strictObject({
            index: z
              .int()
              .min(0)
              .max(beats.length - 1),
            scene: validScene,
          }),
        )
        .max(beats.length),
    }),
    'Review the rendered contact sheet left to right row by row. Return replacement compositions only for shots with a concrete problem: obscured or clipped copy, empty frame, illegible contrast, wrong focal point, losing the product label on the packshot or nearly identical shots despite available alternate material. Keep good shots, the brief, its wording and its visual continuity. An empty fixes array means the rendered frames passed.',
    [
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: JSON.stringify({
              storyboard: context,
              compositions: result.scenes,
            }),
          },
          {
            type: 'input_image',
            image_url: sheet.toDataURL('image/jpeg', 0.9),
            detail: 'high',
          },
        ],
      },
    ],
    signal,
    4200,
  )
  for (const fix of reviewed.fixes) result.scenes[fix.index] = fix.scene
  return result.scenes
}
