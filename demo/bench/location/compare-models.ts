import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { locateProduct } from '../../ground-product.js'
import type { BoundingBox } from '../../localize.js'
import type { Shop } from '../types.js'
import type { Case } from './live.js'

const dir = path.dirname(fileURLToPath(import.meta.url))
const bench = path.dirname(dir)
const models = ['gpt-5.4', 'gpt-6-luna', 'gpt-6.2-sol', 'gpt-6.2-astra']
type Trial = Case & { split: string; model: string; key: string; timestamp: string; prediction: BoundingBox | null; latency_ms: number; error: string | null; blank: boolean }
const logfile = path.join(dir, 'model-comparison.jsonl')
const old = await readFile(logfile, 'utf8').catch((error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT') return ''
  throw error
})
const history: Trial[] = old.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
const cached = new Map(history.map(row => [row.key, row]))
const reportOnly = process.argv.includes('--report-only')
const locator = await readFile(path.join(bench, '..', 'ground-product.ts'))
const rows: Trial[] = []
const jobs: (() => Promise<void>)[] = []
for (const split of ['annotations', 'validation']) {
  const data: { cases: Case[] } = JSON.parse(await readFile(path.join(dir, split + '.json'), 'utf8'))
  for (const [index, item] of data.cases.entries()) {
    const shopDir = path.join(bench, 'shops', item.shop)
    const shop: Shop = JSON.parse(await readFile(path.join(shopDir, 'shop.json'), 'utf8'))
    const product = shop.products.find(p => p.id === item.target)
    if (!product) throw Error('Unknown product ' + item.target)
    const references = await Promise.all(product.images.map(f => readFile(path.join(shopDir, f))))
    const frame = await readFile(path.join(bench, 'frames', item.shop, item.frame + '.jpg'))
    for (let i = 0; i < models.length; i++) {
      const model = models[(i + index) % models.length]
      if (reportOnly) {
        const observations = history.filter(row => row.split === split && row.model === model &&
          row.shop === item.shop && row.frame === item.frame && row.target === item.target)
        const observed = observations.at(-1)
        if (!observed) throw Error('Missing saved observation for ' + [split, model, item.frame, item.target].join('/'))
        rows.push(observed)
        continue
      }
      const hash = createHash('sha256').update(locator).update(JSON.stringify({ model, split, item, product })).update(frame)
      for (const ref of references) hash.update(ref)
      const key = hash.digest('hex')
      const previous = cached.get(key)
      if (previous && !previous.error) { rows.push(previous); continue }
      jobs.push(async () => {
        const start = performance.now()
        let prediction: BoundingBox | null = null
        let error: string | null = null
        try {
          prediction = await locateProduct(frame, { ...product, references }, model)
        } catch (cause) {
          error = cause instanceof Error
            ? [cause.name, (cause as { status?: number }).status].filter(Boolean).join(' ')
            : 'Unknown error'
        }
        const row: Trial = { ...item, split, model, key, timestamp: new Date().toISOString(), prediction, latency_ms: Math.round(performance.now()-start), error, blank: item.shop === 'kitchen' && item.frame === 'empty-with-speech' }
        await appendFile(logfile, JSON.stringify(row) + '\n')
        rows.push(row)
        console.log(model, item.frame, error ?? (prediction ? 'box' : 'none'), row.latency_ms)
      })
    }
  }
}
async function worker() {
  for (;;) {
    const job = jobs.shift()
    if (!job) return
    await job()
  }
}
await Promise.all([worker(), worker()])
function iou(a: BoundingBox, b: BoundingBox | null) {
  if (!b) return 0
  const w = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))
  const h = Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
  return w*h/(a.width*a.height+b.width*b.height-w*h)
}
const lines = ['# เปรียบเทียบโมเดลตีกรอบสินค้า', '',
  'กำหนด SKU เป้าหมายจากเฉลยให้ทุกรุ่น ใช้ภาพ เฉลย รูปอ้างอิง พรอมป์ ขนาดภาพ 512 px และ reasoning low ชุดเดียวกัน เรียก Responses หนึ่งครั้งต่อคู่สินค้าและเฟรมต่อรุ่น ยกเว้นภาพสีล้วนที่ตรวจในเครื่อง สลับลำดับโมเดลตามเฟรมและรันพร้อมกันสูงสุดสองงาน', '',
  'กรอบผ่านเมื่อ IoU ≥ 0.50 คะแนน IoU เฉลี่ยรวมกรณีที่ขาดกรอบเป็นศูนย์ เวลาระบุตำแหน่งรวมการเตรียมรูป การรับผล และการรอคำขอที่ผิดพลาด ข้ามภาพสีล้วนที่ประมวลผลในเครื่อง เวลาจำแนก SKU วัดแยกในรายงาน Decisions', '',
  '| ชุด | โมเดล | กรอบผ่าน / มีเป้าหมาย | IoU เฉลี่ย | กรอบผิด / ไม่มีเป้าหมาย | เวลาเฉลี่ย (ms) | มัธยฐาน (ms) | สูงสุด (ms) | ข้อผิดพลาด |', '|---|---|---:|---:|---:|---:|---:|---:|---:|']
for (const [split, label] of [['all','รวม'],['annotations','ชุดแรก'],['validation','ชุดภาพใหม่']]) {
  for (const model of models) {
    const trials = rows.filter(r => r.model === model && (split === 'all' || r.split === split))
    const pos = trials.filter(r => r.box)
    const neg = trials.filter(r => !r.box)
    const ious = pos.map(r => iou(r.box!,r.prediction))
    const times = trials.filter(r => !r.blank).map(r => r.latency_ms).sort((a,b) => a-b)
    const avg = (ns: number[]) => ns.reduce((a,b) => a+b,0)/ns.length
    const passed = ious.filter(value => value >= 0.5).length
    const falseBoxes = neg.filter(row => row.prediction).length
    const errors = trials.filter(row => row.error).length
    const mid = Math.floor(times.length / 2)
    const median = times.length % 2 ? times[mid] : (times[mid-1] + times[mid]) / 2
    lines.push('| '+[label, model, passed+'/'+pos.length, avg(ious).toFixed(3), falseBoxes+'/'+neg.length,
      times.length ? Math.round(avg(times)) : '—', times.length ? Math.round(median) : '—',
      times.length ? Math.max(...times) : '—', errors].join(' | ')+' |')
  }
}
lines.push('', '## ผลกรอบบนแต่ละเฟรม', '',
  'ตัวเลขเป็น IoU ของกรอบที่โมเดลให้ เทียบกับกรอบเฉลยของสินค้าในภาพนั้น', '',
  '| เฟรม | เป้าหมาย | '+models.join(' | ')+' |', '|---|---|---:|---:|---:|---:|')
for (const item of rows.filter(row => row.model === models[0])) {
  const scores = models.map(model => {
    const trial = rows.find(r => r.model === model && r.shop === item.shop && r.frame === item.frame && r.target === item.target)!
    if (trial.error) return 'error'
    if (!trial.box) return trial.prediction ? 'กรอบผิด' : 'เว้นกรอบถูก'
    return trial.prediction ? iou(trial.box, trial.prediction).toFixed(3) : 'ขาดกรอบ'
  })
  const photo = '['+item.frame+'](../frames/'+item.shop+'/'+item.frame+'.jpg)'
  lines.push('| '+[photo, item.target, ...scores].join(' | ')+' |')
}
lines.push('', 'สามร้านจำลอง มีเสื้อผ้า เครื่องครัว และอิเล็กทรอนิกส์ สองกรณีในชุดแรกใช้เฟรมเสื้อสองตัวร่วมกันโดยระบุคนละเป้าหมาย ชุดภาพใหม่ใช้คนละภาพต้นทางกับชุดแรก ทั้งสองชุดมีขนาดเล็กและใช้วัดตำแหน่งเมื่อทราบ SKU แล้ว', '',
  '[ผลรายเฟรม](model-comparison.jsonl) · [เฉลยชุดแรก](annotations.json) · [เฉลยชุดภาพใหม่](validation.json)', '',
  'อ่านผลล่าสุดที่บันทึกไว้จาก demo ด้วย `node --import tsx bench/location/compare-models.ts --report-only` เอา `--report-only` ออกเพื่อทดสอบผ่าน API โดยใช้ผลสำเร็จเดิมซ้ำเมื่อโค้ดตัวตีกรอบ ภาพ และโจทย์ตรงกัน', '')
await writeFile(path.join(dir,'model-comparison.md'), lines.join('\n'))
if (rows.some(row => row.error)) process.exitCode = 1
