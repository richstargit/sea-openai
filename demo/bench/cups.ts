// Look-alike shop check: does adding a description or "จุดแยกรุ่น" help Choice pick the right cup?
// Usage: npx tsx bench/cups.ts   (writes bench/cups/results.md)
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { root, jpeg512 } from '../common.js'
import { decisionRequest, selectAnswer, sendDecision } from '../decisions.js'

type Item = { id: string; name: string; price: number; image: string; description: string; distinct: string }
const shop: { products: Item[]; frames: { file: string; label: string; note: string }[] } =
  JSON.parse(await readFile(path.join(root, 'bench/cups/shop.json'), 'utf8'))
const sampleDir = path.join(root, 'samples/cup-shop')
// Many shops name variants by code only ("รุ่น A / รุ่น B"), so the name alone cannot separate look-alikes.
const generic: Record<string, string> = { 'CUP-01': 'แก้วเอสเปรสโซ รุ่น A', 'CUP-02': 'แก้วเอสเปรสโซ รุ่น B', 'CUP-03': 'แก้วมัค รุ่น C',
  'CUP-04': 'แก้วมัคสีเขียว รุ่น D', 'CUP-05': 'แก้วมัคสีเขียว รุ่น E', 'CUP-06': 'แก้วใส รุ่น F', 'CUP-07': 'แก้วใส รุ่น G', 'CUP-08': 'แก้วใส รุ่น H',
  'CUP-09': 'แก้วเก็บความเย็น รุ่น I', 'CUP-10': 'แก้วเก็บความเย็น รุ่น J', 'CUP-11': 'แก้วมัค รุ่น K', 'CUP-12': 'ถ้วย รุ่น L' }
const variants = {
  'ชื่ออย่างเดียว': (p: Item) => ({ ...p, description: '', distinct: undefined }),
  'ชื่อ + คำอธิบาย': (p: Item) => ({ ...p, distinct: undefined }),
  'ชื่อ + คำอธิบาย + จุดแยกรุ่น': (p: Item) => p,
  'ชื่อรุ่นกลาง ๆ อย่างเดียว': (p: Item) => ({ ...p, name: generic[p.id], description: '', distinct: undefined }),
  'ชื่อรุ่นกลาง ๆ + คำอธิบาย': (p: Item) => ({ ...p, name: generic[p.id], distinct: undefined }),
  'ชื่อรุ่นกลาง ๆ + คำอธิบาย + จุดแยกรุ่น': (p: Item) => ({ ...p, name: generic[p.id] }),
}
type Row = { variant: string; file: string; label: string; predicted: string; confidence: number | null; runnerUp: string; gap: number; latency: number; error?: string }
const rows: Row[] = []
const frames = await Promise.all(shop.frames.map(async f => ({ ...f, jpeg: await jpeg512(await readFile(path.join(sampleDir, 'frames', f.file))) })))
const jobs = Object.entries(variants).flatMap(([variant, map]) => frames.map(frame => ({ variant, map, frame })))
let next = 0
async function worker() {
  while (next < jobs.length) {
    const { variant, map, frame } = jobs[next++]
    const catalog = shop.products.map(p => ({ ...map(p), images: [] as string[] }))
    const start = performance.now()
    try {
      const body = decisionRequest(frame.jpeg, 'choice', catalog, '')
      if (variant.endsWith('อย่างเดียว')) for (const c of (body.questions[0] as { choices: { value: string; description: string }[] }).choices)
        c.description = c.description.replace(/ — $/, '')
      const answer = selectAnswer(await sendDecision(body), 'choice', catalog)
      const [a, b] = answer.probabilities
      rows.push({ variant, file: frame.file, label: frame.label, predicted: answer.product_id, confidence: answer.confidence,
        runnerUp: b ? b.id + ' ' + Math.round(b.p * 100) + '%' : '', gap: a && b ? a.p - b.p : 1, latency: Math.round(performance.now() - start) })
    } catch (e) {
      rows.push({ variant, file: frame.file, label: frame.label, predicted: 'error', confidence: null, runnerUp: '', gap: 0, latency: Math.round(performance.now() - start), error: String(e instanceof Error ? e.message : e) })
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
const out = ['# ร้านแก้วน้ำ: คำอธิบายช่วย Choice ไหม', '', `${frames.length} เฟรม × ${Object.keys(variants).length} แบบ · Choice + ภาพอย่างเดียว · gpt-6-luna · คลัง ${shop.products.length} รายการ`, '',
  '| แบบ | ถูก | ขึ้นผิดตัว | พลาดเป็น none | ความมั่นใจเฉลี่ยเมื่อถูก | เวลาเฉลี่ย |', '|---|---:|---:|---:|---:|---:|']
for (const variant of Object.keys(variants)) {
  const r = rows.filter(x => x.variant === variant)
  const ok = r.filter(x => x.predicted === x.label)
  const conf = ok.map(x => x.confidence ?? 0)
  out.push(`| ${variant} | ${ok.length}/${r.length} | ${r.filter(x => x.predicted !== 'none' && x.predicted !== 'error' && x.predicted !== x.label).length} | ${r.filter(x => x.predicted === 'none' && x.label !== 'none').length} | ${conf.length ? Math.round(conf.reduce((a, b) => a + b, 0) / conf.length * 100) + '%' : '–'} | ${Math.round(r.reduce((a, b) => a + b.latency, 0) / r.length)} ms |`)
}
out.push('', '| เฟรม | เฉลย | ' + Object.keys(variants).join(' | ') + ' |', '|---|---|' + Object.keys(variants).map(() => '---').join('|') + '|')
for (const f of shop.frames) {
  const cells = Object.keys(variants).map(v => {
    const x = rows.find(r => r.variant === v && r.file === f.file)!
    const mark = x.predicted === x.label ? '✓' : '✗'
    return `${mark} ${x.predicted}${x.confidence !== null ? ' ' + Math.round(x.confidence * 100) + '%' : ''} (รอง ${x.runnerUp})${x.error ? ' ' + x.error : ''}`
  })
  out.push(`| ${f.file} ${f.note} | ${f.label} | ${cells.join(' | ')} |`)
}
console.log(out.join('\n'))
await writeFile(path.join(root, 'bench/cups/results.md'), out.join('\n') + '\n')
