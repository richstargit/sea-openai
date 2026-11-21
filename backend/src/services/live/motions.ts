import { z } from 'zod'
import { select } from '@/services/video/direction.js'

/* AI Motion Designer: original `compose` motions (data layers, see public/overlay/graphics/compose.js)
 * for a shop, spread across live moments. One structured call, then sanitised so a bad layer never
 * reaches the overlay. */

export const MOMENTS = ['intro', 'productIn', 'price', 'deal', 'callToAction', 'transition', 'celebrate', 'outro'] as const
const KINDS = ['text', 'panel', 'image', 'number', 'line', 'dot', 'ring'] as const
const IN = ['fade', 'fade-up', 'fade-down', 'slide-left', 'slide-right', 'pop', 'drop', 'scale-in', 'blur-in', 'rotate-in', 'flip-x', 'flip-y', 'stretch', 'wipe-right', 'wipe-left', 'wipe-up', 'iris', 'none', 'typewriter', 'mask-up', 'count-up', 'draw'] as const
const HOLD = ['none', 'float', 'pulse', 'sway', 'spin', 'breathe'] as const
const OUT = ['none', 'fade', 'fade-down', 'fade-up', 'slide-left', 'slide-right', 'pop-out', 'scale-out', 'wipe-out', 'blur-out'] as const
const TOKENS = ['text', 'sub', 'hi', 'on-hi', 'accent', 'accent2', 'surface', 'paper', 'ink', 'white', 'black', 'none']
const ALIGN = ['left', 'center', 'right'] as const

// every field is required (strict structured output); neutral values mean "unused"
const layerSchema = z.strictObject({
  kind: z.enum(KINDS), text: z.string(), x: z.number(), y: z.number(), w: z.number(), h: z.number(),
  size: z.number(), weight: z.number(), color: z.string(), bg: z.string(), radius: z.number(), align: z.enum(ALIGN),
  in: z.enum(IN), at: z.number(), dur: z.number(), hold: z.enum(HOLD), out: z.enum(OUT), outAt: z.number(),
  value: z.number(), from: z.number(), prefix: z.string(), suffix: z.string(), thickness: z.number(),
})
const motionSchema = z.strictObject({
  id: z.string(), name: z.string(), moment: z.enum(MOMENTS), description: z.string(), seconds: z.number(), layers: z.array(layerSchema),
})
const outputSchema = z.strictObject({ motions: z.array(motionSchema) })

export const motionsBody = z.object({
  shop: z.string().trim().max(80).default(''),
  mood: z.string().trim().max(200).default(''),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  accent2: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  products: z.array(z.object({ name: z.string().trim().min(1).max(120), price: z.number().nonnegative().max(1e9) })).max(20).default([]),
  count: z.number().int().min(1).max(12).default(8),
  moments: z.array(z.enum(MOMENTS)).min(1).max(8).optional(),
})

export type ComposeLayer = Record<string, string | number>
export type DesignedMotion = { id: string; name: string; moment: (typeof MOMENTS)[number]; description: string; seconds: number; layers: ComposeLayer[] }

const clamp = (n: unknown, lo: number, hi: number, fallback = lo) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback)
const round = (n: number) => Math.round(n * 100) / 100
const colorOk = (c: unknown): c is string => typeof c === 'string' && (TOKENS.includes(c) || /^#[0-9a-f]{3,8}$/i.test(c))
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

function cleanLayer(raw: z.infer<typeof layerSchema>, seconds: number): ComposeLayer | null {
  const kind = raw.kind
  if (!(KINDS as readonly string[]).includes(kind)) return null
  const text = String(raw.text ?? '').trim().slice(0, 80)
  if (kind === 'text' && !text) return null
  if (!colorOk(raw.color)) return null
  const x = clamp(raw.x, 0, 100)
  const layer: ComposeLayer = { kind, x: round(x), y: round(clamp(raw.y, 0, 100)), w: round(clamp(raw.w, 0, 100 - x, 0)), color: raw.color }
  if (kind === 'text') Object.assign(layer, { text, size: round(clamp(raw.size, 2, 14, 4)), weight: clamp(raw.weight, 300, 900, 600), align: (ALIGN as readonly string[]).includes(raw.align) ? raw.align : 'left' })
  if (kind === 'text' || kind === 'panel' || kind === 'image' || kind === 'ring') layer.h = round(clamp(raw.h, 0, 100 - Number(layer.y), 0))
  if (kind === 'number') Object.assign(layer, { size: round(clamp(raw.size, 2, 14, 6)), weight: clamp(raw.weight, 300, 900, 700), align: raw.align, value: raw.value, from: raw.from, prefix: String(raw.prefix).slice(0, 8), suffix: String(raw.suffix).slice(0, 8) })
  if (kind === 'line' || kind === 'ring') layer.thickness = round(clamp(raw.thickness, 0.1, 3, 0.5))
  if (colorOk(raw.bg) && raw.bg !== 'none') layer.bg = raw.bg
  if (raw.radius > 0) layer.radius = round(clamp(raw.radius, 0, 50))
  // text-only / number-only / line-only recipes fall back to fade elsewhere
  const only: Record<string, string> = { typewriter: 'text', 'mask-up': 'text', 'count-up': 'number', draw: 'line' }
  layer.in = (IN as readonly string[]).includes(raw.in) && (!only[raw.in] || only[raw.in] === kind) ? raw.in : 'fade'
  layer.at = round(clamp(raw.at, 0, Math.max(0, seconds - 0.8), 0))
  if (raw.dur > 0) layer.dur = round(clamp(raw.dur, 0.1, 2, 0.5))
  if (raw.hold !== 'none' && (HOLD as readonly string[]).includes(raw.hold)) layer.hold = raw.hold
  // every layer must exit before the end
  const outAt = clamp(raw.outAt, Number(layer.at) + 0.4, seconds, seconds - 0.4)
  layer.out = raw.out !== 'none' && (OUT as readonly string[]).includes(raw.out) ? raw.out : 'fade'
  layer.outAt = round(raw.outAt > 0 ? outAt : Math.max(Number(layer.at) + 0.4, seconds - 0.4))
  return layer
}

export function sanitizeMotions(raw: z.infer<typeof outputSchema>['motions'], count: number, allowed: readonly string[]): DesignedMotion[] {
  const ids = new Set<string>()
  const motions: DesignedMotion[] = []
  for (const m of raw) {
    if (!allowed.includes(m.moment)) continue
    const seconds = round(clamp(m.seconds, 2, 6, 4))
    const layers = (Array.isArray(m.layers) ? m.layers : []).map((l) => cleanLayer(l, seconds)).filter((l): l is ComposeLayer => l !== null).slice(0, 9)
    if (layers.length < 2) continue
    const base = slug(m.id) || slug(m.moment) || 'motion'
    let id = base
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`
    ids.add(id)
    motions.push({ id, name: String(m.name).trim().slice(0, 40), moment: m.moment, description: String(m.description).trim().slice(0, 160), seconds, layers })
  }
  return motions.slice(0, count)
}

export async function designMotions(input: z.infer<typeof motionsBody>, signal: AbortSignal) {
  const started = Date.now()
  const moments = input.moments ?? [...MOMENTS]
  const result = await select(
    'design_motions',
    outputSchema,
    [
      `You are the motion designer of a Thai live-commerce stream. Design exactly ${input.count} DISTINCT, beautiful, original motions for this shop, spread across the moments ${moments.join(', ')} (several per moment). Vary layout, composition, recipes, colours and rhythm: e.g. a bold full-width price slam, a minimal corner tag, a stacked kinetic headline, a ring + number count-up, a diagonal wipe band, a cinematic letterbox title.`,
      'Each motion: id (short unique english slug), name (short Thai), moment, description (one Thai line on what it looks like), seconds (2-6), 2-9 layers for a 16:9 frame.',
      'Layers are positioned in % of the frame (x, y, w, h in 0-100, staying inside it), size in vh (2-14). Text may use only the placeholders {name} {price} {code} {shop}; never invent prices, discounts or claims. Put a panel or bg behind text so it stays legible over busy video.',
      `Colours: tokens ${TOKENS.join('|')} or #hex; use accent/accent2 for the shop colours. Entrances (in): ${IN.join(', ')} (typewriter and mask-up only for text, count-up only for number, draw only for line). Hold: ${HOLD.join(', ')}. Exit (out): ${OUT.join(', ')}.`,
      'Timings in seconds within the motion: at (start), dur, outAt. EVERY layer must exit by the end (set out and outAt). Use neutral values for unused fields: text "", numbers 0, hold "none", out "none" only with outAt 0, bg "none".',
    ].join(' '),
    JSON.stringify({ shop: input.shop, mood: input.mood, accent: input.accent, accent2: input.accent2, products: input.products }),
    signal,
    Math.min(6000, 600 + input.count * 350),
  )
  return { motions: sanitizeMotions(result.motions, input.count, moments), latencyMs: Date.now() - started }
}
