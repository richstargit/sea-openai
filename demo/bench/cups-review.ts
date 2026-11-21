// Build bench/cups/review.html: every cup-shop frame with the chosen SKU, its box from Sol, scores and timings.
// Usage: npx tsx bench/cups-review.ts   (real API calls: 10 Choice + up to 10 Sol)
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { root, jpeg512 } from '../common.js'
import { decisionRequest, selectAnswer, sendDecision } from '../decisions.js'
import { locateProduct } from '../localize.js'

type Item = { id: string; name: string; price: number; image: string; description: string; distinct: string }
const shop: { products: Item[]; frames: { file: string; label: string; note: string }[] } =
  JSON.parse(await readFile(path.join(root, 'bench/cups/shop.json'), 'utf8'))
const sample = (...p: string[]) => path.join(root, 'samples/cup-shop', ...p)
const catalog = shop.products.map(p => ({ ...p, images: [p.image] }))
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const dataUrl = (b: Buffer) => 'data:image/jpeg;base64,' + b.toString('base64')

type Row = { file: string; note: string; label: string; predicted: string; name: string; confidence: number | null; top: { id: string; name: string; p: number }[];
  held: number; choiceMs: number; tokens: number; box: { x: number; y: number; width: number; height: number } | null; boxMs: number; boxError?: string; thumb: string }
const rows: Row[] = []
for (const f of shop.frames) {
  const original = await readFile(sample('frames', f.file))
  const frame = await jpeg512(original)
  const t0 = performance.now()
  const raw = await sendDecision(decisionRequest(frame, 'choice', catalog, ''))
  const choiceMs = Math.round(performance.now() - t0)
  const answer = selectAnswer(raw, 'choice', catalog)
  const usage = (raw as { usage?: { total_tokens?: number } }).usage
  let box: Row['box'] = null
  let boxMs = 0
  let boxError: string | undefined
  if (answer.product_id !== 'none') {
    const t1 = performance.now()
    try {
      const target = catalog.find(p => p.id === answer.product_id)!
      box = await locateProduct(original, { ...target, references: [await readFile(sample('images', target.image))] })
    } catch (e) { boxError = e instanceof Error ? e.message : String(e) }
    boxMs = Math.round(performance.now() - t1)
  }
  const thumb = dataUrl(await sharp(original).rotate().resize(720, 720, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer())
  rows.push({ file: f.file, note: f.note, label: f.label, predicted: answer.product_id, name: answer.product_name, confidence: answer.confidence,
    top: answer.probabilities.slice(0, 3), held: answer.held_up_probability, choiceMs, tokens: usage?.total_tokens ?? 0, box, boxMs, boxError, thumb })
  console.log(f.file, answer.product_id, box ? 'box' : '-', choiceMs + 'ms', boxMs + 'ms')
}

const correct = rows.filter(r => r.predicted === r.label).length
const located = rows.filter(r => r.label !== 'none')
const boxed = located.filter(r => r.box).length
const avg = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0
const pct = (v: number | null) => v === null ? '–' : Math.round(v * 100) + '%'
const variants = (await readFile(path.join(root, 'bench/cups/results.md'), 'utf8')).split('\n').filter(l => /^\| ชื่อ/.test(l))
  .map(l => l.split('|').slice(1, -1).map(c => c.trim()))

const cards = rows.map(r => {
  const ok = r.predicted === r.label
  const b = r.box
  return `<article class="frame ${ok ? 'ok' : 'bad'}">
  <div class="shot"><img src="${r.thumb}" alt="${esc(r.note)}">${b ? `<div class="box" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.width * 100}%;height:${b.height * 100}%"><span>${esc(r.predicted)}</span></div>` : ''}</div>
  <div class="meta">
    <div class="head"><b>${esc(r.file.replace('.jpg', ''))}</b><span class="verdict">${ok ? '✓ ถูก' : '✗ ผิด'}</span></div>
    <p class="note">${esc(r.note)}</p>
    <p class="answer">${r.predicted === 'none' ? 'ไม่พบสินค้าในระบบ' : esc(r.predicted + ' · ' + r.name)} <small>มั่นใจ ${pct(r.confidence)}</small></p>
    <p class="small">เฉลย ${esc(r.label)} · รอง: ${r.top.slice(1).map(t => esc(t.id) + ' ' + pct(t.p)).join(', ')}</p>
    <p class="small">จับคู่ ${r.choiceMs} ms · ${r.tokens} tokens${r.predicted !== 'none' ? ' · กรอบ ' + (b ? r.boxMs + ' ms' : r.boxError ? 'ไม่สำเร็จ' : 'หาไม่เจอ') : ''} · ยกสินค้า ${pct(r.held)}</p>
  </div></article>`
}).join('\n')

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ผลทดสอบร้านแก้ว</title><style>
:root{--ink:#24251f;--muted:#666961;--line:#d9dad1;--paper:#f7f7f2;--card:#fff;--ok:#2f9e5b;--bad:#c2410c;--accent:#ff7845;--box:#70ff8b}
@media (prefers-color-scheme:dark){:root{--ink:#ecebe4;--muted:#a3a59b;--line:#3a3c35;--paper:#171815;--card:#20221e}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 "Inter","Leelawadee UI",Tahoma,sans-serif}
main{max-width:1180px;margin:auto;padding:32px 16px 64px}h1{font-size:clamp(26px,4vw,40px);letter-spacing:-.03em;margin:0 0 6px}h2{font-size:20px;margin:36px 0 12px}
.lead{color:var(--muted);margin:0 0 22px;max-width:780px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.kpi{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.kpi b{display:block;font-size:28px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}.kpi small{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
th,td{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}tr.best td{background:color-mix(in srgb,var(--ok) 10%,transparent);font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}
.frame{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden}.frame.bad{border-color:var(--bad)}
.shot{position:relative;line-height:0;background:#111}.shot img{width:100%;height:auto}
.box{position:absolute;border:3px solid var(--box);border-radius:5px;box-shadow:0 0 0 1px #142919,inset 0 0 0 1px #142919}
.box span{position:absolute;left:-3px;bottom:100%;margin-bottom:3px;background:var(--box);color:#0f2414;font:700 12px/1.6 system-ui;padding:0 6px;border-radius:4px;white-space:nowrap}
.meta{padding:12px 14px 14px}.head{display:flex;justify-content:space-between;align-items:center}.verdict{font-weight:700;color:var(--ok)}.bad .verdict{color:var(--bad)}
.note{margin:2px 0 8px;color:var(--muted);font-size:14px}.answer{margin:0;font-weight:600}.answer small{font-weight:400;color:var(--muted)}.small{margin:4px 0 0;font-size:13px;color:var(--muted)}
ul{padding-left:20px}li{margin:4px 0}code{font-size:13px}
</style></head><body><main>
<h1>ผลทดสอบร้านแก้ว: จับสินค้า + ตีกรอบ</h1>
<p class="lead">10 เฟรมจาก samples/cup-shop เทียบคลัง 12 ใบ (มีคู่หน้าตาคล้ายกัน เช่น CUP-04/05 มัคเขียวลายร่อง–ผิวเรียบ และ CUP-01/02 เอสเปรสโซ) · ตั้งค่าดีที่สุด: Choice + ภาพ + ชื่อ + คำอธิบาย + จุดแยกรุ่น (gpt-6-luna) แล้วตีกรอบด้วย gpt-6.2-sol · รันเมื่อ ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
<div class="kpis">
<div class="kpi"><b>${correct}/${rows.length}</b><small>เลือกสินค้าหรือ none ถูก</small></div>
<div class="kpi"><b>${boxed}/${located.length}</b><small>ตีกรอบได้ในเฟรมที่มีสินค้า</small></div>
<div class="kpi"><b>${avg(rows.map(r => r.choiceMs))} ms</b><small>เวลาจับคู่เฉลี่ย (Luna)</small></div>
<div class="kpi"><b>${avg(rows.filter(r => r.box).map(r => r.boxMs))} ms</b><small>เวลาตีกรอบเฉลี่ย (Sol)</small></div>
<div class="kpi"><b>${avg(rows.map(r => r.tokens))}</b><small>tokens ต่อการจับคู่ 1 ครั้ง</small></div>
</div>
<h2>คำอธิบายช่วยไหม (แก้วหน้าตาคล้ายกัน)</h2>
<table><thead><tr><th>แบบข้อมูลในคลัง</th><th class="n">ถูก</th><th class="n">ขึ้นผิดตัว</th><th class="n">พลาดเป็น none</th><th class="n">มั่นใจเฉลี่ยเมื่อถูก</th></tr></thead><tbody>
${variants.map(c => `<tr${c[0] === 'ชื่อรุ่นกลาง ๆ อย่างเดียว' ? '' : c[0].includes('คำอธิบาย') ? ' class="best"' : ''}><td>${esc(c[0])}</td><td class="n">${esc(c[1])}</td><td class="n">${esc(c[2])}</td><td class="n">${esc(c[3])}</td><td class="n">${esc(c[4])}</td></tr>`).join('\n')}
</tbody></table>
<p class="small">ถ้าชื่อสินค้าบอกจุดต่างอยู่แล้ว (เช่น “ลายร่อง” กับ “ผิวเรียบ”) ชื่ออย่างเดียวก็พอ ถ้าร้านตั้งชื่อเป็นรหัสรุ่น คำอธิบายทำให้ผลจาก 4/10 เป็น 10/10</p>
<h2>โหมดสดแบบประหยัด (ทดสอบใน Chrome)</h2>
<ul>
<li>วิดีโอจำลองหน้าต่าง OBS: ภาพเล็กกลางจอดำ 1280×720 · 10 ฉาก ฉากละ 6 วินาที</li>
<li>ตรวจถูก 10/10 ฉาก · การ์ดขึ้น 1.2–2.3 วินาทีหลังเปลี่ยนฉาก · กรอบขึ้นประมาณ 3.5 วินาที · ฉากที่ไม่มั่นใจ (T01, T02) ซูมตรวจซ้ำเองอัตโนมัติ</li>
<li>กรอบเคลื่อนตามสินค้าได้: Sol หาครั้งแรก แล้วเบราว์เซอร์ติดตามพิกเซลเอง (ไม่เรียก API) · วิดีโอที่แพนกล้องตลอด 14 วินาที กรอบแสดง 79% ของเวลา คลาดจากจุดกึ่งกลางจริง median 25 px (กรอบกว้าง ~440 px) · ใช้ Luna 10 ครั้ง Sol 2 ครั้งใน 27 วินาที</li>
<li>ใช้ 15 คำขอ Luna ต่อนาที (รวมซูม) และ Sol 8 ครั้ง เทียบกับโหมด Realtime ที่ยิงได้ราว 2 ครั้งต่อวินาที</li>
<li>เทคนิคที่ใช้: ครอปขอบดำของ OBS ก่อนส่ง · ตรวจเฉพาะเมื่อภาพเปลี่ยนแล้วนิ่ง 0.45 วินาที · ตรวจซ้ำเฉพาะผลที่ไม่มั่นใจ · ตีกรอบครั้งเดียวต่อสินค้าต่อฉาก · ปุ่ม “ตรวจตอนนี้” (Space)</li>
</ul>
<h2>ทุกเฟรมพร้อมกรอบ</h2>
<div class="grid">
${cards}
</div>
<p class="small" style="margin-top:24px">สร้างด้วย <code>npx tsx bench/cups-review.ts</code> · เฉลยตั้งจากการดูภาพ ดู bench/cups/shop.json</p>
</main></body></html>`
await writeFile(path.join(root, 'bench/cups/review.html'), html)
console.log('wrote bench/cups/review.html', correct + '/' + rows.length, 'boxes', boxed + '/' + located.length)
