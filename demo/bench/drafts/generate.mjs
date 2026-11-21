import OpenAI from 'openai'
import dotenv from 'dotenv'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(here, '../../.env'), quiet: true })
const client = new OpenAI({ timeout: 45000, maxRetries: 0 })
const inputs = [['kitchen', 'counter-blender'], ['kitchen', 'cooktop'], ['electronics', 'iphone-13-pro']]
const instructions = 'เขียนคำอธิบายภาษาไทยสั้น ๆ หนึ่งประโยคสำหรับให้ระบบจับคู่สินค้าจากภาพไลฟ์ ใช้เฉพาะสี รูปทรง และตำแหน่งจุดสังเกตที่มองเห็นจากภาพ ไม่เดาสเปก ราคา วัสดุ รุ่น หรือคุณสมบัติ แม้จะคุ้นกับชื่อสินค้า ตอบเฉพาะคำอธิบาย'
const drafts = []
for (const [shopId, productId] of inputs) {
  const shopDir = path.resolve(here, '../shops', shopId)
  const shop = JSON.parse(await readFile(path.join(shopDir, 'shop.json'), 'utf8'))
  const product = shop.products.find(p => p.id === productId)
  if (!product) throw new Error('Unknown catalog ID ' + productId)
  const content = [{ type: 'input_text', text: 'ชื่อในร้าน: ' + product.name }]
  for (const filename of product.images) {
    const image = await readFile(path.join(shopDir, filename))
    content.push({ type: 'input_image', image_url: 'data:image/jpeg;base64,' + image.toString('base64'), detail: 'auto' })
  }
  try {
    const result = await client.responses.create({
      model: 'gpt-4.1-mini', instructions, input: [{ role: 'user', content }],
      max_output_tokens: 220, store: false,
    })
    if (result.status !== 'completed' || !result.output_text?.trim()) throw new Error('No completed draft')
    drafts.push({
      shopId, productId, existingName: product.name, sourceImages: product.images,
      descriptionDraft: result.output_text.trim(), model: result.model, reviewedByMerchant: false,
    })
  } catch (error) {
    console.error('Draft request failed', productId, error.status ?? '', error.code ?? '')
    process.exitCode = 1
    break
  }
}
if (drafts.length === inputs.length) {
  await writeFile(path.join(here, 'descriptions.json'), JSON.stringify(drafts, null, 2) + '\n')
  console.log('Wrote', drafts.length, 'draft descriptions')
}
