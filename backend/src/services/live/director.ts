import { z } from 'zod'
import { AppError } from '@/services/error.service.js'
import { select } from '@/services/video/direction.js'
import { saleFormatGuide, saleFormatIds } from '@/services/video/sale-formats.js'

/* The live director: plans the show before going live, builds the shop's motion kit, and makes the
 * realtime call every second while live (Decisions API: frame + what was just said + show state). */

export const liveProduct = z.object({
  id: z.string().regex(/^[\w-]{1,64}$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).default(''),
  distinct: z.string().max(300).optional(),
  price: z.number().nonnegative().max(1e9),
})
const lineupItem = liveProduct.extend({
  minutes: z.number().min(0.5).max(60).default(3),
  points: z.string().max(600).default(''),
  saleFormat: z.enum(saleFormatIds).optional(),
})
export const planBody = z.object({
  shop: z.string().trim().max(80).default(''),
  tone: z.string().trim().max(200).default('สนุก เป็นกันเอง'),
  language: z.enum(['th', 'en']).default('th'),
  lineup: z.array(lineupItem).min(1).max(20),
})

const overlayCue = z.strictObject({
  at: z.number().min(0).max(3600),
  event: z.enum(['product_card', 'price_pop', 'price_drop', 'free_badge', 'low_stock', 'poll', 'fireworks', 'zoom', 'caption']),
  note: z.string().max(120),
})
const segment = z.strictObject({
  kind: z.enum(['intro', 'product', 'interlude', 'outro']),
  productId: z.string().nullable(),
  title: z.string().max(80),
  seconds: z.number().int().min(10).max(3600),
  opening: z.string().max(300),
  talkingPoints: z.array(z.string().max(200)).max(8),
  callToAction: z.string().max(200),
  cues: z.array(overlayCue).max(8),
})
const plan = z.strictObject({ title: z.string().max(80), segments: z.array(segment).min(2).max(30) })
export type LivePlan = z.infer<typeof plan>

export async function planLive(input: z.infer<typeof planBody>, signal: AbortSignal) {
  const products = input.lineup.map((item) => ({ ...item, format: saleFormatGuide(item.saleFormat) }))
  return select(
    'plan_live_show',
    plan,
    [
      `Direct a live-commerce stream as its show director. Write in ${input.language === 'th' ? 'Thai, natural spoken Thai a host would really say' : 'English'}. Tone: ${input.tone}.`,
      'Open with a short intro segment, give every lineup product its own segment in the given order and roughly its minutes, add a short interlude when the show is long, close with an outro that recaps the deals.',
      'Each product segment: a hook line to open, 3-6 talking points grounded only in the product data (never invent prices, claims, discounts or stock), one clear call to action (CF / add to cart), and overlay cues at seconds into the segment (product_card early, price_pop when the price is said, price_drop only when a discount is given, poll or fireworks sparingly).',
      'Follow the selling-format skeleton when a product has one.',
    ].join(' '),
    JSON.stringify({ shop: input.shop, products }),
    signal,
    6000,
  )
}

// Presets the motion kit may choose from, with what each is for (ids from backend/public/overlay/graphics).
export const KIT_PRESETS: Record<string, string> = {
  'name-strap': 'lower-third strap for the product or host name',
  'product-card': 'product card on the side away from the face',
  'magnet-snap': 'card that snaps to the fingertip',
  'price-pop': 'big price with a tick',
  'price-drop': 'old price struck, new price drops',
  'price-countdown': 'price rolls down to the live price',
  'slot-price': 'slot-machine digits',
  'stamp-free-ship': 'rubber stamp ส่งฟรี',
  'stamp-bestseller': 'rubber stamp ขายดี',
  'coupon-tear': 'coupon with tear-off stub',
  'flash-countdown': 'flash-sale timer with stock',
  'stock-bar': 'draining stock meter',
  'cf-keycaps': 'how to CF in comments',
  'buyer-toast': 'purchase toast',
  'kinetic-claim': 'stacked claims masking in',
  'review-stars': 'review stars',
  'scent-pyramid': 'perfume note pyramid',
  'leader-callouts': 'ingredient leader lines',
  'callout-ring': 'hand-drawn ring around the product',
  'iris-swap': 'circle transition to the next product',
  'blinds-sting': 'blinds stinger with the shop name',
  'letterbox': 'cinematic bars with a title',
  'fireworks': 'fireworks for a milestone',
  'milestone-burst': 'sold count milestone',
  'starting-soon': 'starting soon screen',
  'starting-soon-brb': 'be right back screen',
  'starting-soon-ending': 'thanks for watching screen',
}
const kit = z.strictObject({
  theme: z.strictObject({ accent: z.string().regex(/^#[0-9a-f]{6}$/i), accent2: z.string().regex(/^#[0-9a-f]{6}$/i), look: z.enum(['paper', 'ink', 'pop']), tagStyle: z.enum(['tag', 'sticker', 'receipt', 'flap']) }),
  moments: z.strictObject({
    intro: z.string(), productIn: z.string(), price: z.string(), deal: z.string(), callToAction: z.string(), transition: z.string(), celebrate: z.string(), deadAir: z.string(), outro: z.string(),
  }),
  sting: z.strictObject({ headline: z.string().max(40), kicker: z.string().max(40), entrance: z.enum(['wipe-right', 'mask-up', 'pop', 'iris', 'typewriter', 'slide-right', 'flip-x', 'stretch']) }),
  reasoning: z.string().max(400),
})
export const kitBody = z.object({
  shop: z.string().trim().max(80).default(''),
  mood: z.string().trim().max(200).default(''),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  products: z.array(liveProduct.pick({ name: true, description: true })).max(20).default([]),
})

export async function motionKit(input: z.infer<typeof kitBody>, signal: AbortSignal) {
  const result = await select(
    'design_motion_kit',
    kit,
    'You are the motion designer of a Thai live-commerce stream. Build a coherent motion kit for this shop: two brand colours (keep the given accent when there is one; a second colour that pairs with it), a theme look, a lower-third tag style, and for every live moment pick one preset id from the catalogue that fits the mood and the products. Also write a short intro sting (headline + kicker in Thai) and its entrance. Use only ids from the catalogue.',
    JSON.stringify({ ...input, catalogue: KIT_PRESETS }),
    signal,
    1500,
  )
  // a preset the catalogue does not know falls back to a safe default rather than failing the kit
  const fallback: Record<string, string> = { intro: 'letterbox', productIn: 'product-card', price: 'price-pop', deal: 'price-drop', callToAction: 'cf-keycaps', transition: 'iris-swap', celebrate: 'fireworks', deadAir: 'starting-soon-brb', outro: 'starting-soon-ending' }
  for (const [moment, id] of Object.entries(result.moments))
    if (!KIT_PRESETS[id]) result.moments[moment as keyof typeof result.moments] = fallback[moment] ?? 'name-strap'
  return result
}

// ---------- realtime decision (OpenAI Decisions API) ----------
export const ACTIONS = ['none', 'product_card', 'price_pop', 'price_drop', 'free_badge', 'low_stock', 'zoom', 'poll', 'fireworks'] as const
export const TEAM_COMMANDS = ['none', 'poll', 'fireworks', 'price_pop', 'zoom', 'product_card', 'dead_air_clip', 'next_segment'] as const
export const decideBody = z.object({
  image: z.string().max(1_500_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/),
  transcript: z.string().max(2000).default(''),
  products: z.array(liveProduct.pick({ id: true, name: true, description: true, distinct: true })).min(1).max(200),
  current: z.string().max(64).nullable().default(null),
  // the motion presets the director may pick from (the shop's kit first); defaults to the curated catalogue
  motions: z
    .array(z.object({ id: z.string().regex(/^[a-z0-9-]{1,48}$/), description: z.string().max(160) }))
    .max(80)
    .optional(),
})

type Answer = { type: string; name: string; probability?: number; choice?: string; confidence?: number; probabilities?: { value: string; probability: number }[] }

async function sendDecision(body: object, signal: AbortSignal) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new AppError('SERVICE_UNAVAILABLE', { key: 'so-live-no-ai', message: 'Set OPENAI_API_KEY' })
  const base = (process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, '')
  const response = await fetch(base + '/decisions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  })
  if (response.status === 429) throw new AppError('TOO_MANY_REQUESTS', { key: 'so-live-decide-busy' })
  if (!response.ok) throw new AppError('SERVICE_UNAVAILABLE', { key: 'so-live-decide', message: 'Decisions API HTTP ' + response.status })
  const json = (await response.json()) as { answers?: Answer[] }
  return new Map((json.answers ?? []).map((answer) => [answer.name, answer]))
}

/** One realtime look: which product, is it held up, what should the screen do, how lively, anything risky, any voice command. */
export async function decide(input: z.infer<typeof decideBody>, signal: AbortSignal) {
  const started = performance.now()
  const said = input.transcript.trim()
  const commanded = /ทีม|team/i.test(said)
  const questions: object[] = [
    {
      type: 'choice', name: 'product',
      instructions: 'เลือกสินค้าหลักที่มองเห็นในเฟรมไลฟ์ ใช้คำพูดล่าสุดของแม่ค้าช่วยแยกสินค้าที่คล้ายกัน ถ้าไม่เห็นสินค้าในรายการให้เลือก none',
      choices: [...input.products.map((p) => ({ value: p.id, description: `${p.name} — ${p.description}${p.distinct ? ' · จุดแยกรุ่น: ' + p.distinct : ''}` })), { value: 'none', description: 'ไม่เห็นสินค้าในรายการ' }],
    },
    { type: 'predicate', name: 'held_up', instructions: 'Is the host visibly presenting a product to the camera right now (holding it up, pointing at it, showing it close)? Judge the pose only.' },
    {
      type: 'choice', name: 'action',
      instructions: 'คุณคือผู้กำกับไลฟ์ขายของ ดูภาพและคำพูดล่าสุด แล้วเลือกกราฟิกที่ควรขึ้นจอตอนนี้ เลือก none ถ้ายังไม่มีจังหวะที่ชัด อย่าขึ้นซ้ำบ่อย: price_pop เมื่อพูดราคา, price_drop เมื่อพูดลดราคา, free_badge เมื่อพูดส่งฟรีหรือของแถม, low_stock เมื่อพูดว่าเหลือน้อย, product_card เมื่อยกสินค้าขึ้นมาแนะนำ, zoom เมื่อขอให้ดูใกล้ๆ, poll เมื่อถามความเห็นคนดู, fireworks เมื่อฉลองยอดขาย',
      choices: ACTIONS.map((value) => ({ value, description: value })),
    },
    { type: 'choice', name: 'energy', instructions: 'ไลฟ์ตอนนี้คึกแค่ไหน ดูจากท่าทางและคำพูด', choices: [{ value: 'low', description: 'เงียบ นิ่ง ไม่มีอะไรเกิดขึ้น' }, { value: 'medium', description: 'พูดคุยปกติ' }, { value: 'high', description: 'คึกคัก ตื่นเต้น' }] },
    { type: 'predicate', name: 'risky_claim', instructions: 'Did the host just make an exaggerated, medical or likely illegal product claim (e.g. cures disease, 100% guaranteed results, unapproved health claim)? Use the transcript.' },
  ]
  // the same call also picks which of our motion presets fits this moment, so one request decides everything
  const motions = input.motions ?? Object.entries(KIT_PRESETS).map(([id, description]) => ({ id, description }))
  questions.push({
    type: 'choice', name: 'motion',
    instructions: 'ถ้าควรมีกราฟิกขึ้นจอตอนนี้ เลือก motion preset ที่เข้ากับจังหวะและคำพูดที่สุดจากรายการ ถ้าไม่ควรขึ้นอะไรให้เลือก none',
    choices: [...motions.map((m) => ({ value: m.id, description: m.description })), { value: 'none', description: 'ไม่ต้องขึ้นกราฟิก' }],
  })
  if (commanded)
    questions.push({
      type: 'choice', name: 'team_cmd',
      instructions: 'แม่ค้าสั่งทีมงานด้วยเสียง (คำว่า "ทีม …") เลือกคำสั่งที่ตรงที่สุด เลือก none ถ้าไม่ได้สั่ง',
      choices: TEAM_COMMANDS.map((value) => ({ value, description: value })),
    })
  const content: object[] = [{ type: 'input_image', image_url: input.image }]
  if (said) content.push({ type: 'input_text', text: 'คำพูดล่าสุดของแม่ค้า: ' + said })
  if (input.current) content.push({ type: 'input_text', text: 'สินค้าในช่วงนี้ตามแผน: ' + input.current })
  const answers = await sendDecision({ model: 'gpt-6-luna', input: [{ role: 'user', content }], questions }, signal)
  const choice = (name: string) => answers.get(name)?.choice ?? null
  const probability = (name: string) => answers.get(name)?.probability ?? null
  return {
    product: choice('product'),
    productConfidence: answers.get('product')?.confidence ?? null,
    heldUp: probability('held_up'),
    action: choice('action') ?? 'none',
    motion: choice('motion') ?? 'none',
    motionConfidence: answers.get('motion')?.confidence ?? null,
    actionConfidence: answers.get('action')?.confidence ?? null,
    energy: choice('energy'),
    riskyClaim: probability('risky_claim'),
    teamCommand: commanded ? choice('team_cmd') : null,
    latencyMs: Math.round(performance.now() - started),
  }
}
