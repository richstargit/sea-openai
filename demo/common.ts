import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

export const root = fileURLToPath(new URL('./', import.meta.url))
dotenv.config({ path: path.join(root, '.env'), quiet: true })
export const dataDir = path.resolve(process.env.DEMO_DATA_DIR || path.join(root, 'data'))
export const imageDir = path.join(dataDir, 'images')
export const maxBytes = 8 * 1024 * 1024
export class DemoError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
export const noneName = 'ไม่พบสินค้าในระบบ'

export function decodeImage(value: unknown): Buffer {
  if (typeof value !== 'string') throw new DemoError(400, 'กรุณาส่งรูปภาพ')
  const comma = value.indexOf(',')
  if (!/^data:image\/(jpeg|png|webp);base64$/i.test(value.slice(0, comma))) {
    throw new DemoError(400, 'รูปภาพต้องเป็น JPEG, PNG หรือ WebP แบบ data URL')
  }
  const base64 = value.slice(comma + 1)
  if (base64.length > 4 * Math.ceil(maxBytes / 3)) throw new DemoError(413, 'รูปต้องมีขนาดไม่เกิน 8 MB')
  if (!base64 || /[^A-Za-z0-9+/=]/.test(base64)) throw new DemoError(400, 'อ่านข้อมูลรูปภาพไม่ได้')
  return Buffer.from(base64, 'base64')
}

export async function jpeg512(buffer: Buffer) {
  if (buffer.length > maxBytes) throw new DemoError(413, 'รูปต้องมีขนาดไม่เกิน 8 MB')
  try {
    const image = sharp(buffer, { limitInputPixels: 40_000_000 })
    const { format } = await image.metadata()
    if (!['jpeg', 'png', 'webp'].includes(format || '')) throw new Error()
    return await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
  } catch {
    throw new DemoError(400, 'อ่านรูปไม่ได้ กรุณาใช้ JPEG, PNG หรือ WebP ไม่เกิน 40 ล้านพิกเซล')
  }
}

export type Method = 'choice' | 'reference'
export type Product = { id: string; name: string; price: number; description: string; distinct?: string; images: string[] }
export function captionText(value: unknown) {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > 2000) throw new DemoError(400, 'ข้อความประกอบต้องยาวไม่เกิน 2,000 ตัวอักษร')
  return value.trim()
}
