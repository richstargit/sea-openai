import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { LiveProduct } from '@/models/live-product.model.js'
import { StoredFile } from '@/models/agent-storage.model.js'
import { mongo } from '@/models/mongo.js'
import { saveFile } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'

/* The live catalog lives in Mongo per account (photos in agent_files); detection reads it from here. */

const photo = z.string().max(2_000_000).regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
const code = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).refine((v) => v.toLowerCase() !== 'none', 'none is reserved')
export const productBody = z.object({
  code,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  distinct: z.string().trim().max(300).default(''),
  price: z.number().finite().nonnegative().max(1e9),
  images: z.array(photo).min(1).max(3),
})
// on edit every field is optional; images replace the old photos only when sent
export const productPatch = productBody.partial()

type Doc = { _id: string; code: string; name: string; description: string; distinct: string; price: number; imageIds: string[] }
const view = (p: Doc) => ({ id: p.code, key: p._id, name: p.name, description: p.description, distinct: p.distinct || undefined, price: p.price, images: p.imageIds })

async function storePhotos(userId: string, productCode: string, images: string[]) {
  const ids: string[] = []
  for (const [n, image] of images.entries()) {
    const type = image.slice(11, image.indexOf(';'))
    const file = await saveFile(userId, `${productCode}-${n + 1}.${type === 'jpeg' ? 'jpg' : type}`, Buffer.from(image.slice(image.indexOf(',') + 1), 'base64'))
    ids.push(file.id)
  }
  return ids
}
const dropPhotos = (userId: string, ids: string[]) => mongo(() => StoredFile.deleteMany({ userId, _id: { $in: ids } }))

export async function listProducts(userId: string) {
  const docs = await mongo(() => LiveProduct.find({ userId }).sort({ createdAt: 1 }).lean<Doc[]>())
  return docs.map(view)
}

export async function createProduct(userId: string, input: z.infer<typeof productBody>) {
  if (await mongo(() => LiveProduct.exists({ userId, code: input.code })))
    throw new AppError('CONFLICT', { key: 'so-live-product-exists', message: 'Product code already exists', messageTH: 'มีรหัสสินค้านี้แล้ว' })
  const imageIds = await storePhotos(userId, input.code, input.images)
  const doc: Doc = { _id: randomUUID(), code: input.code, name: input.name, description: input.description, distinct: input.distinct, price: input.price, imageIds }
  await mongo(() => LiveProduct.create({ ...doc, userId }))
  return view(doc)
}

export async function updateProduct(userId: string, productCode: string, patch: z.infer<typeof productPatch>) {
  const current = await mongo(() => LiveProduct.findOne({ userId, code: productCode }).lean<Doc>())
  if (!current) throw new AppError('NOT_FOUND', { key: 'so-live-product-missing' })
  if (patch.code && patch.code !== productCode && (await mongo(() => LiveProduct.exists({ userId, code: patch.code }))))
    throw new AppError('CONFLICT', { key: 'so-live-product-exists', message: 'Product code already exists', messageTH: 'มีรหัสสินค้านี้แล้ว' })
  const imageIds = patch.images ? await storePhotos(userId, patch.code ?? productCode, patch.images) : current.imageIds
  const next: Doc = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => k !== 'images' && v !== undefined)), imageIds }
  await mongo(() => LiveProduct.updateOne({ _id: current._id, userId }, { $set: { code: next.code, name: next.name, description: next.description, distinct: next.distinct, price: next.price, imageIds } }))
  if (patch.images) await dropPhotos(userId, current.imageIds)
  return view(next)
}

export async function deleteProduct(userId: string, productCode: string) {
  const current = await mongo(() => LiveProduct.findOneAndDelete({ userId, code: productCode }).lean<Doc>())
  if (!current) throw new AppError('NOT_FOUND', { key: 'so-live-product-missing' })
  await dropPhotos(userId, current.imageIds)
}

/** A product photo, only for its owner, sent with its real image type. */
export async function productPhoto(userId: string, fileId: string) {
  const owned = await mongo(() => LiveProduct.exists({ userId, imageIds: fileId }))
  const file = owned && (await mongo(() => StoredFile.findOne({ _id: fileId, userId }, 'name bytes').lean()))
  if (!file) throw new AppError('NOT_FOUND', { key: 'so-live-photo-missing' })
  const bytes = Buffer.from(file.bytes.buffer)
  const type = bytes[0] === 0x89 ? 'image/png' : bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/jpeg'
  return { bytes, type }
}
