import sharp from 'sharp'
import { noneName, type Product } from '../common.js'

type Candidate = Product & { references?: Buffer[] }
type Scored = { id: string; p: number }
const image = (buffer: Buffer) => ({ type: 'input_image' as const, image_url: 'data:image/jpeg;base64,' + buffer.toString('base64') })
const text = (value: string) => ({ type: 'input_text' as const, text: value })

// Dark live frames hide pattern and shape. Stretch levels only when the frame is clearly underexposed.
export async function brighten(jpeg: Buffer) {
  const { channels } = await sharp(jpeg).stats()
  const mean = channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) / 3
  if (mean >= 95) return jpeg
  return sharp(jpeg).normalise({ lower: 1, upper: 99 }).modulate({ brightness: Math.min(1.6, 110 / Math.max(mean, 1)) }).jpeg({ quality: 85 }).toBuffer()
}

export const contrastInstructions = 'เลือกสินค้าหลักที่มองเห็นในเฟรมไลฟ์ สินค้าบางตัวหน้าตาคล้ายกัน ให้เทียบจุดแยกรุ่นที่เห็นได้ เช่น รูปทรง จำนวนและตำแหน่งกล้อง ปุ่ม ฝา หูจับ ลาย ขนาดช่องลาย และสี ถ้าสินค้าในภาพคล้ายตัวเลือกแต่จุดแยกรุ่นไม่ตรง (เช่น รุ่นอื่นหรือคนละลาย) ถ้ามีเพียงการพูดถึงแต่ไม่เห็นสินค้า หรือไม่มีตัวเลือกที่ตรง ให้เลือก none'

// Second look for uncertain frames: show the live frame beside reference photos of the closest SKUs only.
export function shouldRerank(winner: string, confidence: number | null, scores: Scored[], threshold = 0.8) {
  const best = scores[0]
  if (!best) return false
  if (winner === 'none') return best.p >= 0.15
  return (confidence ?? 0) < threshold
}

export function rerankRequest(frame: Buffer, products: Candidate[], scores: Scored[], k = 3) {
  const picked = scores.filter(s => s.p >= 0.02).slice(0, k).map(s => products.find(p => p.id === s.id)!).filter(p => p.references?.length)
  const content = [text('ภาพที่ 1 คือเฟรมไลฟ์ ภาพถัดไปคือรูปอ้างอิงของสินค้าที่ใกล้เคียง'), image(frame)]
  for (const p of picked) {
    content.push(text('รูปอ้างอิงของ ' + p.id + ' (' + p.name + '):'))
    for (const ref of p.references!.slice(0, 2)) content.push(image(ref))
  }
  return {
    candidates: picked.map(p => p.id),
    body: {
      model: 'gpt-6-luna', input: [{ role: 'user' as const, content }],
      questions: [{
        type: 'choice' as const, name: 'product',
        instructions: 'สินค้าหลักในเฟรมไลฟ์เป็นรุ่นเดียวกับรูปอ้างอิงตัวไหน เทียบจุดแยกรุ่น เช่น รูปทรง จำนวนและตำแหน่งกล้อง ปุ่ม ฝา หูจับ ลาย และสี ยอมรับมุม แสง การพับ หรือการบังบางส่วนได้ ถ้าคล้ายแต่จุดแยกรุ่นไม่ตรง หรือไม่เห็นสินค้า ให้เลือก none',
        choices: [...picked.map(p => ({ value: p.id, description: p.name + ' — ' + p.description })), { value: 'none', description: noneName }],
      }],
    },
  }
}

export function readChoice(response: unknown) {
  const answers = (response as { answers?: unknown[] })?.answers
  const answer = Array.isArray(answers) ? answers.find((a): a is { type: string; name: string; choice: string; confidence: number; probabilities: { value: string; probability: number }[] } =>
    !!a && typeof a === 'object' && (a as { name?: unknown }).name === 'product') : undefined
  if (answer?.type !== 'choice' || typeof answer.choice !== 'string' || typeof answer.confidence !== 'number' || !Array.isArray(answer.probabilities))
    throw new Error('Rerank answer malformed')
  return { choice: answer.choice, confidence: answer.confidence, probabilities: answer.probabilities }
}
