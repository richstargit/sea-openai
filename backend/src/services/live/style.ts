import { z } from 'zod'
import { select } from '@/services/video/direction.js'

/* "Let AI fill it in": a LiveStyle suggestion (tone, colours, tag style, mood) from the shop's catalog. */

const hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const suggestionSchema = z.strictObject({
  tone: z.string(), accent: hex, accent2: hex, font: z.string(), mood: z.string(), tagStyle: z.enum(['tag', 'sticker', 'receipt', 'flap']),
})

export const styleBody = z.object({
  shop: z.string().trim().max(80).default(''),
  products: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(400).default(''),
    price: z.number().nonnegative().max(1e9).default(0),
  })).max(30).default([]),
})

const INSTRUCTIONS = `You set up the on-screen look and host voice for a Thai live-commerce shop from its products.
tone: how the host talks, 2-5 Thai words (e.g. "สนุก เป็นกันเอง"). mood: motion feel, short Thai phrase (e.g. "มินิมอล หรู"). 
accent and accent2: two #rrggbb brand colours that suit the products and read on a dark video frame. font: a Thai Google Font family list (Prompt, Kanit, Sarabun, Noto Sans Thai...) or "".
tagStyle: tag, sticker, receipt or flap. Match the products: skincare = soft and premium, snacks = fun and loud, etc.`

export async function suggestStyle(body: z.infer<typeof styleBody>, signal: AbortSignal) {
  const lines = body.products.map((p) => `- ${p.name} (฿${p.price}) ${p.description}`.trim()).join('\n')
  return select('live_style', suggestionSchema, INSTRUCTIONS, `Shop: ${body.shop || '(unnamed)'}\nProducts:\n${lines || '(none yet)'}`, signal, 400)
}
