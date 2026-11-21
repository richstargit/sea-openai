import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import lockfile from 'proper-lockfile'
import { dataDir, imageDir, jpeg512, DemoError, type Product } from './common.js'

const catalogFile = path.join(dataDir, 'catalog.json')
async function locked<T>(operation: () => Promise<T>) {
  await mkdir(imageDir, { recursive: true })
  const release = await lockfile.lock(catalogFile, {
    realpath: false, retries: { retries: 20, minTimeout: 25, maxTimeout: 200, randomize: true }
  })
  try { return await operation() } finally { await release() }
}

export async function listProducts(): Promise<Product[]> {
  try { return JSON.parse(await readFile(catalogFile, 'utf8')) }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }
}

async function save(products: Product[]) {
  const temp = path.join(dataDir, randomUUID() + '.tmp')
  try {
    await writeFile(temp, JSON.stringify(products, null, 2) + '\n', { flag: 'wx' })
    await rename(temp, catalogFile)
  } finally { await rm(temp, { force: true }) }
}

export async function addProduct(fields: Record<string, unknown>, images: Buffer[]) {
  const { id, name, description, price, distinct } = fields
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id) || id.toLowerCase() === 'none')
    throw new DemoError(400, 'รหัสต้องใช้ A–Z, a–z, 0–9, - หรือ _ ไม่เกิน 64 ตัว และห้ามใช้ none')
  if (typeof name !== 'string' || !name.trim() || name.length > 120 ||
      typeof description !== 'string' || !description.trim() || description.length > 500)
    throw new DemoError(400, 'กรอกชื่อสินค้า (ไม่เกิน 120 ตัว) และคำอธิบาย (ไม่เกิน 500 ตัว)')
  if (distinct !== undefined && (typeof distinct !== 'string' || distinct.length > 300))
    throw new DemoError(400, 'จุดแยกรุ่นต้องเป็นข้อความไม่เกิน 300 ตัวอักษร')
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
    throw new DemoError(400, 'ราคาต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
  if (images.length < 1 || images.length > 3) throw new DemoError(400, 'เลือกภาพอ้างอิง 1–3 รูป')
  const jpegs = await Promise.all(images.map(jpeg512))
  return locked(async () => {
    const products = await listProducts()
    if (products.some(p => p.id === id)) throw new DemoError(409, 'มีรหัสสินค้านี้แล้ว')
    const product: Product = { id, name: name.trim(), price, description: description.trim(), images: [] }
    if (typeof distinct === 'string' && distinct.trim()) product.distinct = distinct.trim()
    try {
      for (const jpeg of jpegs) {
        const filename = randomUUID() + '.jpg'
        product.images.push(filename)
        await writeFile(path.join(imageDir, filename), jpeg)
      }
      await save([...products, product])
    } catch (error) {
      await removeImages(product)
      throw error
    }
    return product
  })
}

function removeImages(product: Product) {
  return Promise.all(product.images.map(file => rm(path.join(imageDir, file), { force: true })))
}
export async function deleteProduct(id: string) {
  await locked(async () => {
    const products = await listProducts()
    const existing = products.find(p => p.id === id)
    if (!existing) throw new DemoError(404, 'ไม่พบรหัสสินค้านี้')
    await save(products.filter(p => p.id !== id))
    await removeImages(existing)
  })
}

// Copy references under the catalog lock, then release it before the network request.
export function referenceSnapshot() {
  return locked(async () => {
    const products = await listProducts()
    return Promise.all(products.map(async p => ({
      ...p, references: await Promise.all(p.images.map(file => readFile(path.join(imageDir, file))))
    })))
  })
}
