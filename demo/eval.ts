import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { listProducts } from './catalog.js'
import { root, captionText, type Method } from './common.js'
import { detectProduct } from './detect.js'

const evalDir = path.resolve(process.env.DEMO_EVAL_DIR || path.join(root, 'eval'))
const framesDir = path.join(evalDir, 'frames')
type Frame = { file: string; label: string; caption: string }
const frames: Frame[] = []
const products = await listProducts()
for (const folder of await readdir(framesDir, { withFileTypes: true })) {
  if (!folder.isDirectory()) continue
  const dir = path.join(framesDir, folder.name)
  for (const filename of (await readdir(dir)).filter(f => /\.jpe?g$/i.test(f)).sort()) {
    if (folder.name !== 'none' && !products.some(p => p.id === folder.name))
      throw new Error('ไม่พบรหัสใน catalog: ' + folder.name)
    const file = path.join(dir, filename)
    let caption = ''
    try { caption = captionText(await readFile(file.replace(/\.jpe?g$/i, '.txt'), 'utf8')) }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    frames.push({ file, label: folder.name, caption })
  }
}
if (frames.length && (!process.env.OPENAI_API_KEY?.trim() || !products.length))
  throw new Error('การวัดผลต้องมี OPENAI_API_KEY และสินค้าใน catalog อย่างน้อยหนึ่งรายการ')

type Trial = { correct: boolean; ms: number; error?: string; paired: boolean }
const paired = frames.filter(f => f.caption).length
const lines = ['# ผลการวัดการจับสินค้า', '',
  'เฟรมทั้งหมด ' + frames.length + ' เฟรม มีข้อความประกอบ ' + paired + ' เฟรม', '',
  '| วิธี | ข้อมูลที่ส่ง | Accuracy | เฉลี่ย (ms) | สูงสุด (ms) | Requests | Errors |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: |']
const errors: string[] = []
function row(method: Method, input: string, trials: Trial[]) {
  const n = trials.length
  const sum = trials.reduce((total, t) => total + t.ms, 0)
  const max = trials.reduce((largest, t) => Math.max(largest, t.ms), 0)
  const accuracy = n ? (100 * trials.filter(t => t.correct).length / n).toFixed(1) + '%' : '—'
  lines.push('| ' + [method, input, accuracy, n ? Math.round(sum / n) : '—', n ? max : '—', n, trials.filter(t => t.error).length].join(' | ') + ' |')
}
for (const method of ['choice', 'reference'] as const) {
  const images: Trial[] = []
  const withText: Trial[] = []
  for (const frame of frames) {
    const buffer = await readFile(frame.file)
    for (const mode of frame.caption ? ['image', 'caption'] : ['image']) {
      const start = performance.now()
      const trial: Trial = { correct: false, ms: 0, paired: !!frame.caption }
      try {
        const result = await detectProduct(buffer, method, mode === 'caption' ? frame.caption : undefined)
        trial.correct = result.product_id === frame.label
      } catch (e) {
        trial.error = e instanceof Error ? e.message : String(e)
        errors.push([method, mode, path.relative(framesDir, frame.file), trial.error].join(' · '))
      }
      trial.ms = Math.round(performance.now() - start)
      const trials = mode === 'caption' ? withText : images
      trials.push(trial)
    }
  }
  row(method, 'ภาพอย่างเดียว', images)
  if (paired && paired < frames.length) row(method, 'ภาพอย่างเดียว (เฉพาะเฟรมที่มีข้อความ)', images.filter(t => t.paired))
  row(method, 'ภาพ + ข้อความ', withText)
}
if (!frames.length) lines.push('', 'ยังไม่มีเฟรมทดสอบ วางไฟล์ JPG ใน eval/frames/<product_id>/ หรือ eval/frames/none/')
else if (!paired) lines.push('', 'ยังไม่มีข้อความประกอบ เพิ่มไฟล์ .txt ชื่อเดียวกับเฟรมเพื่อวัดภาพ + ข้อความ')
if (errors.length) {
  lines.push('', '## คำขอที่ไม่สำเร็จ', '', ...errors.map(err => '- ' + err))
  process.exitCode = 1
}
lines.push('')
const report = lines.join('\n')
await writeFile(path.join(evalDir, 'results.md'), report)
console.log(report)
