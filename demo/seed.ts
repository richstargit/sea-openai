import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { addProduct, listProducts } from './catalog.js'
import { dataDir } from './common.js'

const seeds = [
  { id: 'chili', name: 'น้ำพริกเผา', price: 89, description: 'น้ำพริกสีแดงเข้มบรรจุขวดแก้วฝาแดง' },
  { id: 'soap', name: 'สบู่สมุนไพร', price: 65, description: 'สบู่ก้อนในกล่องกระดาษสีเขียว' },
  { id: 'basket', name: 'ตะกร้าสาน', price: 250, description: 'ตะกร้าหูหิ้วสานด้วยเส้นไม้ไผ่สีน้ำตาลอ่อน' }
]
const existing = await listProducts()
for (const product of seeds) {
  if (existing.some(p => p.id === product.id)) { console.log('มีสินค้าแล้ว:', product.id); continue }
  const dir = path.join(dataDir, 'seed', product.id)
  const files = (await readdir(dir)).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort()
  if (!files.length) { console.log('รอภาพอ้างอิง 1–3 รูปใน', dir); continue }
  await addProduct(product, await Promise.all(files.map(file => readFile(path.join(dir, file)))))
  console.log('เพิ่มสินค้าแล้ว:', product.id)
}
