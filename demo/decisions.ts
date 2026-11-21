import OpenAI from 'openai'
import { DemoError, noneName, type Method, type Product } from './common.js'

const image = (buffer: Buffer) => ({ type: 'input_image' as const, image_url: 'data:image/jpeg;base64,' + buffer.toString('base64') })
const text = (value: string) => ({ type: 'input_text' as const, text: value })
type Part = ReturnType<typeof image | typeof text>
type Question = { name: string; type: 'predicate'; instructions: Part[] | string }
  | { name: string; type: 'choice'; instructions: string; choices: { value: string; description: string }[] }
type Candidate = Product & { references?: Buffer[] }

// Shops with look-alike variants add what tells a SKU apart from its siblings (lid, handle, pattern).
export const choiceText = (p: Pick<Product, 'name' | 'description' | 'distinct'>) =>
  p.name + ' — ' + p.description + (p.distinct ? ' · จุดแยกรุ่น: ' + p.distinct : '')

export const heldUpInstructions = 'Is a person visibly presenting a physical item for others to see? Count holding a phone up for an audience or spreading a garment towards viewers. Judge the visible pose only, regardless of the person, setting, speech or whether the item is in this catalog. Merely wearing, using, carrying or passing an object does not count.'

export function decisionRequest(frame: Buffer, method: Method, products: Candidate[], caption: string, heldInstructions = heldUpInstructions) {
  const questions: Question[] = []
  if (method === 'choice') {
    if (products.length > 254) throw new DemoError(400, 'วิธี choice รองรับสินค้าได้สูงสุด 254 รายการต่อคำขอ')
    questions.push({
      type: 'choice', name: 'product',
      instructions: 'เลือกสินค้าหลักที่มองเห็นในเฟรมไลฟ์ ใช้ข้อความประกอบช่วยแยกสินค้าที่คล้ายกัน ถ้ามีเพียงการพูดถึงแต่ไม่เห็นสินค้า หรือไม่มีตัวเลือกที่ตรง ให้เลือก none',
      choices: [...products.map(p => ({ value: p.id, description: choiceText(p) })), { value: 'none', description: noneName }]
    })
  } else {
    if (products.length > 399) throw new DemoError(400, 'วิธี reference รองรับสินค้าได้สูงสุด 399 รายการต่อคำขอ')
    for (const p of products) {
      if (!p.references?.length) throw new DemoError(500, 'ขาดรูปอ้างอิงสำหรับ ' + p.id)
      questions.push({
        type: 'predicate', name: 'match_' + p.id,
        instructions: [text('สินค้าที่เห็นในภาพไลฟ์คือสินค้าเดียวกับรูปอ้างอิงนี้หรือไม่? ตรวจสินค้าหลักที่มองเห็นจริง โดยใช้ข้อความประกอบเป็นบริบทเท่านั้น'), ...p.references.map(image)]
      })
    }
  }
  questions.push({ type: 'predicate', name: 'held_up', instructions: heldInstructions })
  const content: Part[] = [image(frame)]
  if (caption) content.push(text(caption))
  return { model: 'gpt-6-luna', input: [{ role: 'user', content }], questions }
}

function upstreamError(status: number) {
  if (status === 401 || status === 403) return new DemoError(502, 'OpenAI ไม่อนุญาตคำขอ กรุณาตรวจ API key และสิทธิ์ใช้ Decisions')
  if (status === 429) return new DemoError(429, 'คำขอเกินโควตาหรืออัตราที่ OpenAI อนุญาต กรุณาตรวจโควตาแล้วลองใหม่')
  return new DemoError(502, 'OpenAI ประมวลผลคำขอไม่ได้ (HTTP ' + status + ')')
}

type DecisionBody = ReturnType<typeof decisionRequest>
type DecisionResource = { create: (body: DecisionBody, options?: { signal?: AbortSignal }) => Promise<unknown> }
export async function sendDecision(body: DecisionBody, signal?: AbortSignal): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new DemoError(503, 'กรุณาตั้ง OPENAI_API_KEY ในไฟล์ .env แล้วเปิดเซิร์ฟเวอร์อีกครั้ง')
  const client = new OpenAI({ apiKey, timeout: 60000, maxRetries: 0 }) as OpenAI & { decisions?: DecisionResource }
  try {
    if (client.decisions?.create) return await client.decisions.create(body, { signal })
    const timeout = AbortSignal.timeout(60000)
    const response = await fetch(client.baseURL.replace(/\/$/, '') + '/decisions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout
    })
    if (!response.ok) throw upstreamError(response.status)
    return await response.json()
  } catch (e) {
    if (e instanceof DemoError) throw e
    if (e instanceof OpenAI.APIError && e.status) throw upstreamError(e.status)
    throw new DemoError(502, 'ติดต่อ Decisions API ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่')
  }
}

function malformed(): never { throw new DemoError(502, 'Decisions API ส่งคำตอบไม่ครบหรือรูปแบบคะแนนไม่ถูกต้อง กรุณาลองใหม่') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return malformed()
  return value as Record<string, unknown>
}
function probability(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return malformed()
  return value
}
export function selectAnswer(response: unknown, method: Method, products: Pick<Product, 'id' | 'name'>[]) {
  const raw = record(response).answers
  if (!Array.isArray(raw)) return malformed()
  const answers = new Map<string, Record<string, unknown>>()
  for (const item of raw) {
    const answer = record(item)
    if (answer.type === 'refusal') throw new DemoError(422, 'โมเดลปฏิเสธการประเมิน กรุณาลองเฟรมอื่นหรือปรับข้อความประกอบ')
    if (typeof answer.name !== 'string' || answers.has(answer.name)) return malformed()
    answers.set(answer.name, answer)
  }
  if (answers.size !== (method === 'choice' ? 2 : products.length + 1)) return malformed()
  function predicate(name: string) {
    const answer = answers.get(name)
    if (answer?.type !== 'predicate') return malformed()
    return probability(answer.probability)
  }
  const held_up_probability = predicate('held_up')
  let winner: string
  let confidence: number | null
  let scores: Map<string, number>
  if (method === 'choice') {
    const answer = answers.get('product')
    if (answer?.type !== 'choice' || typeof answer.choice !== 'string' || !Array.isArray(answer.probabilities)) return malformed()
    scores = new Map()
    for (const item of answer.probabilities) {
      const { value, probability: p } = record(item)
      if (typeof value !== 'string' || scores.has(value)) return malformed()
      scores.set(value, probability(p))
    }
    if (!scores.has('none') || scores.size !== products.length + 1 || !scores.has(answer.choice)) return malformed()
    winner = answer.choice
    confidence = probability(answer.confidence)
  } else {
    scores = new Map(products.map(p => [p.id, predicate('match_' + p.id)]))
    winner = 'none'
    confidence = null
  }
  // Put the selected Choice first in a tie, including when a tie crosses the top-3 boundary.
  const probabilities = products.map(({ id, name }) => ({ id, name, p: scores.get(id) ?? malformed() }))
    .sort((a, b) => b.p - a.p || Number(b.id === winner) - Number(a.id === winner))
  const top3 = probabilities.slice(0, 3)
  if (method === 'reference' && top3[0]?.p >= 0.5) {
    winner = top3[0].id
    confidence = top3[0].p
  }
  return {
    product_id: winner, product_name: products.find(p => p.id === winner)?.name ?? noneName,
    confidence, top3, probabilities, none_probability: scores.get('none') ?? null,
    held_up: held_up_probability >= 0.5, held_up_probability,
  }
}
