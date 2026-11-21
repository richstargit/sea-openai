import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type { BoundingBox } from '../../localize.js'
import type { Case } from './live.js'

type Observation = Case & {prediction: BoundingBox | null; error: string | null; latency_ms: number}
const folder = path.dirname(fileURLToPath(import.meta.url))
const validation = process.argv.includes('--validation')
const candidate = process.argv.includes('--candidate')
const production = process.argv.includes('--production')
const annotationsFile = validation ? 'validation.json' : 'annotations.json'
const responseFile = validation ? 'validation-observations.json' : production ? 'production-results.json' : candidate ? 'candidate-results.json' : 'observations.json'
const output = validation ? 'validation-' : production ? 'production-' : candidate ? 'candidate-' : ''
const galleryFile = validation ? 'review.html' : output + 'gallery.html'
const observations = JSON.parse(await readFile(path.join(folder, responseFile), 'utf8'))
const trials: Observation[] = observations.trials
const frozen = await readFile(path.join(folder, annotationsFile))
if (createHash('sha256').update(frozen).digest('hex') !== observations.annotation_sha256) throw Error('Annotation version mismatch')

function overlap(a: BoundingBox, b: BoundingBox | null) {
  if (!b) return 0
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  return (w*h) / (a.width*a.height + b.width*b.height - w*h)
}
const average = (v: number[]) => v.length ? v.reduce((a,b) => a + b) / v.length : 0
const positives = trials.filter(t => t.box && !t.error)
const negatives = trials.filter(t => !t.box && !t.error)
const ious = positives.map(t => overlap(t.box!, t.prediction))
const positiveMatches = ious.filter(iou => iou >= 0.5).length
const errors = trials.filter(t => t.error).length
const falseBoxes = negatives.filter(t => t.prediction).length
const misses = positives.filter(t => !t.prediction).length
const times = trials.map(t => t.latency_ms).sort((a,b) => a-b)
const summary = [
  '| Metric | Result |','| --- | ---: |',
  '| Target/frame pairs | '+trials.length+' |','| API errors | '+errors+' |',
  '| Successful requests scored (present / absent) | '+positives.length+' / '+negatives.length+' |',
  '| Mean IoU on present targets (missing box = 0) | '+average(ious).toFixed(3)+' |',
  '| IoU ≥ 0.50 on present targets | '+positiveMatches+'/'+positives.length+' |',
  '| Present target with no box | '+misses+'/'+positives.length+' |',
  '| Absent target with a false box | '+falseBoxes+'/'+negatives.length+' |',
  '| Average / max position request (ms) | '+Math.round(average(times))+' / '+Math.max(...times)+' |',
  '| Average when target absent, including errors (ms) | '+Math.round(average(trials.filter(t=>!t.box).map(t=>t.latency_ms)))+' |'
]
const rows = ['| Shop | Frame | Target | Ground truth | Predicted | IoU | ms |','| --- | --- | --- | --- | --- | ---: | ---: |']
const cards = []
type Source = { file: string; author?: string; title?: string; page?: string; productUrl?: string; license?: string; licenseUrl?: string; license_url?: string }
const credits = new Map<string, string>()
const escape = (s: string) => s.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;')
function link(url: string, title: string) {
  if (new URL(url).protocol !== 'https:') throw Error('Expected HTTPS source URL')
  return '<a href="'+escape(url)+'">'+escape(title)+'</a>'
}
for (const key of new Set(trials.map(t=>t.shop))) {
  const shop: {cases: {id:string; image:string}[]; sources: Source[]} = JSON.parse(await readFile(path.join(folder,'..','shops',key,'shop.json'),'utf8'))
  for (const c of shop.cases) {
    const s=shop.sources.find(s=>s.file===c.image)
    if (!s?.author || !s.license) continue
    credits.set(key+'/'+c.id,'<small>'+link(s.page || s.productUrl!, s.title || 'ภาพต้นฉบับ')+' · '+escape(s.author)+' · '+link(s.license_url || s.licenseUrl!, s.license)+' · ปรับขนาดและซ้อนกรอบเพื่อวัดตำแหน่ง</small>')
  }
}
for (const t of trials) {
  const frame = '../frames/'+t.shop+'/'+t.frame+'.jpg'
  const {width, height} = await sharp(path.join(folder,frame)).metadata()
  const iou = t.box && !t.error ? overlap(t.box, t.prediction).toFixed(3) : '—'
  rows.push('| '+[t.shop,t.frame,t.target,t.box?'present':'absent',t.error?'error':t.prediction?'box':'none',iou,t.latency_ms].join(' | ')+' |')
  function rect(b: BoundingBox | null, color: string, dash = '') {
    return b ? '<rect x="'+b.x*1000+'" y="'+b.y*1000+'" width="'+b.width*1000+'" height="'+b.height*1000+'" fill="none" stroke="'+color+'" stroke-width="3" vector-effect="non-scaling-stroke" '+dash+'/>' : ''
  }
  const outcome = t.error ? 'ข้อผิดพลาดจาก API' : t.box ? 'IoU ' + iou : t.prediction ? 'มีกรอบทั้งที่สินค้าไม่อยู่ในภาพ' : 'เว้นกรอบถูกต้อง'
  cards.push('<article><figure style="aspect-ratio:'+width+'/'+height+';width:min(100%, '+(340*width/height)+'px)"><img src="'+frame+'" alt="'+t.frame+'"><svg viewBox="0 0 1000 1000" preserveAspectRatio="none">'+rect(t.box,'#00dbba')+rect(t.prediction,'#ff5e33','stroke-dasharray="7 3"')+'</svg></figure><strong>'+t.target+'</strong><small>'+t.shop+' / '+t.frame+'</small><p>'+outcome+' · '+t.latency_ms+' ms</p>'+(credits.get(t.shop+'/'+t.frame) ?? '')+'</article>')
}
const doc = [
  '# การตรวจตำแหน่งสินค้า', '',
  'ให้ระบบทราบรหัสสินค้าและรูปอ้างอิงก่อนหาตำแหน่งในเฟรม ใช้ร้านและภาพสาธิตที่แยกจาก catalog จริง ประเมินเป็นคู่สินค้า/เฟรม ทั้งภาพที่มีเป้าหมายและภาพที่ไม่มี',
  '', 'กำหนดกรอบด้วยตาใน [เฉลย]('+annotationsFile+') บน [ภาพตาราง]('+(validation?'validation-grid':'annotation-grid')+'.png) ก่อนเรียกโมเดล เลือกตัวอย่างแบบเจาะจงหลากกรณี โดยผู้ประเมินหนึ่งคน อ้างอิงแกน x จากซ้ายและ y จากบน IoU คือพื้นที่ส่วนซ้อนทับหารด้วยพื้นที่รวมของกรอบเฉลยและกรอบทำนาย',
  '', 'โมเดล '+observations.model, '', ...summary, '', ...rows, '', '[เปรียบเทียบกรอบบนภาพทุกกรณี]('+galleryFile+') · [คำตอบและเวลารายคำขอ]('+responseFile+')', '',
  'จาก demo/ ให้รัน `node --import tsx bench/location/report.ts'+(validation?' --validation':production?' --production':candidate?' --candidate':'')+'` เพื่อสร้างรายงานจากผลที่บันทึกไว้', ''
].join('\n')
await writeFile(path.join(folder,output+'results.md'),doc)
await writeFile(path.join(folder,galleryFile),'<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ตรวจกรอบตำแหน่งสินค้า</title><style>body{margin:24px auto;padding:0 18px;max-width:1200px;font:16px/1.5 system-ui;color:#242622;background:#f5f5f1}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}article{background:white;border:1px solid #ccc;border-radius:10px;padding:10px}figure{position:relative;margin:0 auto 6px;max-width:100%;max-height:340px}img,svg{position:absolute;inset:0;width:100%;height:100%}small{display:block;overflow-wrap:anywhere}p{margin:4px 0 12px}</style><h1>ตรวจกรอบตำแหน่งสินค้า</h1><p>เขียวเส้นทึบ = เฉลย · ส้มเส้นประ = โมเดล · ภาพที่ไม่มีกรอบสีเขียวคือกรณีที่สินค้าเป้าหมายไม่ปรากฏ</p><main>'+cards.join('')+'</main><p>ภาพสินค้าและฉากจำลองดัดแปลงจาก <a href="https://dummyjson.com/docs/products">DummyJSON</a> มีการปรับขนาดและซ้อนกรอบเปรียบเทียบ</p></html>')
