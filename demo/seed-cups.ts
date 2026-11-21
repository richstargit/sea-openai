// Seed the look-alike cup shop from samples/cup-shop into a separate catalog folder.
// PowerShell: $env:DEMO_DATA_DIR='data-cups'; npx tsx seed-cups.ts; npm run dev
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { addProduct, listProducts } from './catalog.js'
import { dataDir, root } from './common.js'

type Item = { id: string; name: string; price: number; image: string; description: string; distinct: string }
const shop: { products: Item[] } = JSON.parse(await readFile(path.join(root, 'bench/cups/shop.json'), 'utf8'))
const existing = await listProducts()
for (const { image, ...product } of shop.products) {
  if (existing.some(p => p.id === product.id)) { console.log('มีสินค้าแล้ว:', product.id); continue }
  await addProduct(product, [await readFile(path.join(root, 'samples/cup-shop/images', image))])
  console.log('เพิ่มสินค้าแล้ว:', product.id)
}
console.log('คลังอยู่ที่', dataDir)
