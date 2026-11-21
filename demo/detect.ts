import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { listProducts, referenceSnapshot } from './catalog.js'
import { captionText, DemoError, imageDir, jpeg512, type Method, type Product } from './common.js'
import { decisionRequest, selectAnswer, sendDecision } from './decisions.js'
import { locateProduct, type BoundingBox, type LocalizationStatus } from './localize.js'

type FrameProgress = {
  onMatch?: (match: ReturnType<typeof selectAnswer>) => void
  signal?: AbortSignal
}

export async function detectProduct(frameBuffer: Buffer, method: Method, caption?: string, locate = false, progress: FrameProgress = {}) {
  const start = performance.now()
  if (method !== 'choice' && method !== 'reference') throw new DemoError(400, 'กรุณาเลือกวิธี choice หรือ reference')
  if (typeof locate !== 'boolean') throw new DemoError(400, 'locate ต้องเป็น true หรือ false')
  const context = captionText(caption)
  const frame = await jpeg512(frameBuffer)
  const products: (Product & { references?: Buffer[] })[] = method === 'reference' ? await referenceSnapshot() : await listProducts()
  if (!products.length) throw new DemoError(409, 'คลังสินค้ายังว่าง กรุณาเพิ่มสินค้าอย่างน้อยหนึ่งรายการก่อนตรวจจับ')
  progress.signal?.throwIfAborted()
  const response = await sendDecision(decisionRequest(frame, method, products, context), progress.signal)
  const match = selectAnswer(response, method, products)
  progress.signal?.throwIfAborted()
  progress.onMatch?.(match)
  let bbox: BoundingBox | null = null
  let localization_status: LocalizationStatus = 'skipped'
  const target = products.find(p => p.id === match.product_id)
  if (locate && target) {
    try {
      // UUID filenames belong to the classified snapshot even if its SKU is deleted and reused.
      const references = target.references ?? await Promise.all(target.images.map(f => readFile(path.join(imageDir, f))))
      progress.signal?.throwIfAborted()
      bbox = await locateProduct(frameBuffer, { ...target, references }, undefined, progress.signal)
      localization_status = bbox ? 'found' : 'not_found'
    } catch {
      localization_status = 'unavailable'
    }
  }
  return { ...match, bbox, localization_status, latency_ms: Math.round(performance.now() - start) }
}
