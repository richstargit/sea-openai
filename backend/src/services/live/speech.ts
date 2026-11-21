import { toFile } from 'openai'
import { z } from 'zod'
import { AppError } from '@/services/error.service.js'
import { openAIClient } from '@/services/openai.service.js'
import { select } from '@/services/video/direction.js'

export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'application/octet-stream']
export const AUDIO_LIMIT = 2 * 1024 * 1024

export const transcribeQuery = z.object({
  lang: z.enum(['th', 'en']).default('th'),
  hint: z.string().max(400).optional(),
})

const extension = (type: string) =>
  type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'mp4' : type.includes('wav') ? 'wav' : 'webm'

// one short standalone recording -> text; silence gives ''
export async function transcribeLive(bytes: Buffer, type: string, query: z.infer<typeof transcribeQuery>, signal: AbortSignal) {
  if (!Buffer.isBuffer(bytes) || !bytes.length)
    throw new AppError('BAD_REQUEST', { key: 'so-live-audio-missing', message: 'Send the audio as the raw request body', messageTH: 'กรุณาส่งเสียงเป็น raw body' })
  const started = Date.now()
  try {
    const result = await openAIClient().audio.transcriptions.create(
      {
        file: await toFile(bytes, `speech.${extension(type)}`, { type: type === 'application/octet-stream' ? 'audio/webm' : type }),
        model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe',
        language: query.lang,
        response_format: 'json',
        ...(query.hint ? { prompt: query.hint } : {}),
      },
      { signal },
    )
    return { text: result.text.trim(), latencyMs: Date.now() - started }
  } catch (cause) {
    throw new AppError('SERVICE_UNAVAILABLE', { key: 'so-live-transcribe', cause })
  }
}

export const INTENTS = ['price', 'discount', 'free_shipping', 'gift', 'low_stock', 'sold_out', 'new', 'bestseller', 'review', 'ingredients', 'voucher', 'how_to_order', 'cart', 'poll', 'celebrate', 'zoom', 'flash_sale', 'next', 'chat', 'none'] as const

export const understandBody = z.object({
  text: z.string().trim().min(1).max(1000),
  products: z.array(z.object({ id: z.string().max(64), name: z.string().max(200), price: z.number() })).max(50).default([]),
  current: z.string().max(64).nullish(),
  lang: z.enum(['th', 'en']).optional(),
  motions: z
    .object({
      main: z.array(z.object({ id: z.string().max(64), description: z.string().max(200) })).max(20).default([]),
      accent: z.array(z.object({ id: z.string().max(64), description: z.string().max(200) })).max(30).default([]),
    })
    .optional(),
})

const nullable = z.number().nullable()
const understandSchema = z.strictObject({
  corrected: z.string(),
  productId: z.string().nullable(),
  price: nullable,
  from: nullable,
  to: nullable,
  left: nullable,
  code: z.string().nullable(),
  intent: z.enum(INTENTS),
  combo: z.strictObject({ main: z.string().nullable(), accent: z.string().nullable(), caption: z.string().nullable() }),
})

export async function understand(body: z.infer<typeof understandBody>, signal: AbortSignal) {
  const started = Date.now()
  const out = await select(
    'understand_speech',
    understandSchema,
    'You fix speech-recognition mistakes in Thai live-selling talk and extract its meaning. corrected: the sentence as the host most likely said it, Thai numerals to Arabic digits, brand and product names spelled exactly as in the catalog. productId: an id from the catalog only if the sentence is about that product (the current product if it is unnamed and the sentence is about it), else null. price, from, to, left (stock left), code (voucher or CF code): only values that appear in the sentence, never invent numbers, else null. intent: the single best match, none if nothing fits. combo (layered on-screen motion), be conservative: ordinary chatter, greetings, filler or questions give all null. main: one id from motions.main only when the sentence carries info worth showing (price, deal, freebie, how to order/CF, product intro, stock, countdown), else null. accent: one id from motions.accent only when the sentence has real energy or emotion that fits its description, else null. caption: the short punchy hook phrase from the sentence, at most 24 characters, in the sentence language, else null. Never invent ids.',
    JSON.stringify({ sentence: body.text, catalog: body.products, currentProductId: body.current ?? null, language: body.lang ?? 'th', motions: body.motions ?? { main: [], accent: [] } }),
    signal,
    400,
  )
  const known = new Set(body.products.map((p) => p.id))
  const pick = (id: string | null, list: { id: string }[] = []) => (id && list.some((m) => m.id === id) ? id : null)
  const caption = out.combo.caption?.trim().slice(0, 24) || null
  const combo = { main: pick(out.combo.main, body.motions?.main), accent: pick(out.combo.accent, body.motions?.accent), caption }
  return { ...out, combo, productId: out.productId && known.has(out.productId) ? out.productId : null, latencyMs: Date.now() - started }
}
