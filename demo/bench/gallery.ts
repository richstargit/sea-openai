import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import type { Shop, Trial } from './types.js'

const esc = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const families: Record<string, string> = {
  source: 'ภาพต้นทาง', 'live-photo': 'ภาพคนกับสินค้า', 'small-left': 'สินค้าขนาดเล็กทางซ้าย',
  'occluded-right': 'สินค้าด้านขวาถูกบังบางส่วน', 'dim-blur': 'แสงน้อยและภาพเบลอ',
  'stale-speech': 'พูดถึงสินค้าตัวก่อน', 'two-products': 'มีสินค้าสองชิ้น',
  'manual-crop': 'ครอปเฉพาะสินค้าหลัก', empty: 'ฉากว่าง',
}
const methods = ['choice', 'reference'] as const
const modes = ['image', 'caption'] as const
type PhotoSource = {
  file: string; title?: string; product?: string; author?: string; license?: string;
  page?: string; productUrl?: string; license_url?: string; licenseUrl?: string;
}
type ShopLabels = { name: string; products: Map<string, string>; credits: Map<string, string> }

function sourceLink(href: string, title: string) {
  if (new URL(href).protocol !== 'https:') throw Error('Expected HTTPS attribution link')
  return '<a href="' + esc(href) + '">' + esc(title) + '</a>'
}

function cell(t: Trial | undefined, labels: ShopLabels) {
  if (!t || t.error || t.predicted === null) return '<td class="bad">ขาดผล' + (t?.error ? '<small>' + esc(t.error) + '</small>' : '') + '</td>'
  const correct = t.predicted === t.label
  const name = labels.products.get(t.predicted) ?? t.predicted
  const probability = t.confidence === null ? '' : ' · ' + (100 * t.confidence).toFixed(1) + '%'
  let held = ''
  if (t.expectedHeld !== null && t.held !== null) {
    const heldRight = t.held === t.expectedHeld
    held = '<small class="' + (heldRight ? '' : 'bad') + '">ทายว่า' + (t.held ? 'ยก' : 'ไม่ได้ยก') + (heldRight ? '' : ' · ผิด') + '</small>'
  }
  return '<td class="' + (correct ? 'ok' : 'bad') + '">' + (correct ? '✓ ' : '✕ ') + esc(name) + '<small>ความมั่นใจ' +
    (probability ? probability.slice(2) : ' —') + '</small>' + held + '</td>'
}

export async function gallery(trials: Trial[], outputDir: string): Promise<void> {
  const shops = [...new Set(trials.map(t => t.shop))].sort()
  const names = new Map<string, ShopLabels>()
  for (const shop of shops) {
    if (!/^[a-z0-9_-]+$/i.test(shop)) throw Error('Invalid shop name')
    const labels: ShopLabels = {name: shop, products: new Map([['none', 'ไม่พบสินค้า']]), credits: new Map()}
    try {
      const manifest: Shop & {sources?: PhotoSource[]} = JSON.parse(await readFile(path.join(outputDir, 'shops', shop, 'shop.json'), 'utf8'))
      labels.name = manifest.name
      for (const p of manifest.products) labels.products.set(p.id, p.name)
      const sources = new Map(manifest.sources?.map(source => [source.file, source]))
      for (const sample of manifest.cases) {
        const source = sources.get(sample.image)
        if (!source?.license) continue
        const page = source.page || source.productUrl
        const license = source.license_url || source.licenseUrl
        if (!source.author || !page || !license) throw Error('Incomplete image credit: ' + source.file)
        labels.credits.set(sample.id, '<p class="credit">ภาพ ' + sourceLink(page, source.title || 'ต้นฉบับ') +
          ' โดย ' + esc(source.author) + ' · ' + sourceLink(license, source.license) +
          ' · ย่อภาพและบันทึกเป็น JPEG ข้อความประกอบเป็นคำพูดสมมติสำหรับการทดสอบ</p>')
      }
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
    names.set(shop, labels)
  }
  const cases = new Map<string, Map<string, Trial>>()
  for (const t of trials) {
    const key = JSON.stringify([t.shop, t.caseId, t.family])
    const arms = cases.get(key) ?? new Map<string, Trial>()
    const arm = t.method + '/' + t.input
    if (arms.has(arm)) throw Error('Duplicate result for ' + key + ' ' + arm)
    arms.set(arm, t)
    cases.set(key, arms)
  }
  const cards: string[] = []
  for (const arms of cases.values()) {
    const results = [...arms.values()]
    const sample = results[0]
    const { frame, label, family, shop, expectedHeld } = sample
    if (!/^frames\/[a-z0-9_-]+\/[a-z0-9_-]+\.jpg$/i.test(frame)) throw Error('Unexpected gallery frame path: ' + frame)
    if (results.some(t => t.frame !== frame || t.label !== label || t.expectedHeld !== expectedHeld)) throw Error('Inconsistent gallery frame ' + frame)
    const labels = names.get(shop)!
    const checks = [
      results.some(t => !t.error && t.predicted !== null && t.predicted !== label) ? 'sku' : '',
      expectedHeld !== null && results.some(t => !t.error && t.held !== null && t.held !== expectedHeld) ? 'held' : '',
      arms.size < 4 || results.some(t => t.error || t.predicted === null) ? 'error' : '',
    ].filter(Boolean).join(' ')
    const rows = methods.map(method => '<tr><th scope="row">' + method + '</th>' +
      modes.map(mode => cell(arms.get(method + '/' + mode), labels)).join('') + '</tr>').join('')
    const caption = results.find(t => t.input === 'caption')?.text
    cards.push('<article data-shop="' + esc(shop) + '" data-check="' + checks + '">' +
      '<a class="thumb" href="' + esc(frame) + '"><img alt="' + esc(sample.caseId) + '" loading="lazy" src="' + esc(frame) + '"></a>' +
      '<section><p class="meta">' + esc(labels.name) + ' · ' + esc(families[family] ?? family) + '</p>' +
      '<h2>เฉลย · ' + esc(labels.products.get(label) ?? label) + '</h2>' +
      '<p class="scene">' + esc(sample.caseId) + (expectedHeld === null ? '' : ' · ' + (expectedHeld ? 'ยกสินค้า' : 'ไม่ได้ยกสินค้า')) + '</p>' +
      (caption ? '<p class="speech">“' + esc(caption) + '”</p>' : '') +
      '<table><thead><tr><th>วิธี</th><th>ภาพ</th><th>ภาพ + ข้อความ</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      (labels.credits.get(sample.sourceId) ?? '') + '</section></article>')
  }
  const options = shops.map(key => '<option value="' + esc(key) + '">' + esc(names.get(key)!.name) + '</option>').join('')
  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ตรวจผลทีละเฟรม · SnapPromo</title><style>
:root{color-scheme:light;font:16px/1.5 Arial,"Leelawadee UI",sans-serif;color:#222a25;background:#f4f5ef}
*{box-sizing:border-box}body{margin:0}main{max-width:1450px;margin:auto;padding:clamp(15px,3vw,42px)}h1,h2,p{margin:0}
h1{font-size:clamp(25px,4vw,46px)}h2{font-size:19px;line-height:1.4;margin:.24em 0}
header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-bottom:1px solid #ced4c9;padding-bottom:16px}
.filters{display:flex;align-items:center;gap:12px 18px;flex-wrap:wrap;padding:20px 0}select{display:block;margin-top:3px;padding:6px 8px;font:inherit;background:white;border:1px solid #9da99e;border-radius:6px}
output,.meta,.scene,small{font-size:13px;color:#47564b}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(345px,100%),1fr));gap:14px}
article{min-width:0;border:1px solid #d3d8cf;border-radius:12px;background:white;overflow:hidden}article[hidden]{display:none}
.thumb{display:block;background:#e9ebe4;height:200px}.thumb img{width:100%;height:100%;object-fit:contain}section{padding:15px}
.scene{overflow-wrap:anywhere}.speech{font-size:14px;margin:8px 0;color:#3c493d}table{width:100%;table-layout:fixed;border-collapse:collapse;margin-top:11px;font-size:14px}
td,th{border-top:1px solid #e4e7df;padding:6px 4px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th:first-child{width:23%}
small{display:block}.ok{color:#244e31}.bad{color:#992c18}.status{margin-left:auto}
.credit,footer{margin-top:14px;color:#47564b;font-size:13px;overflow-wrap:anywhere}.credit a,footer a{color:#244e31}
</style></head><body><main><header><h1>ตรวจผลทีละเฟรม</h1></header><div class="filters">
<label>ร้าน<select id="shop"><option value="">ทุกร้าน</option>${options}</select></label>
<label>แสดงผล<select id="status"><option value="">ทุกกรณี</option><option value="sku">อย่างน้อยหนึ่งวิธีทายสินค้าผิด</option><option value="held">อย่างน้อยหนึ่งวิธีทายการยกผิด</option><option value="error">มีคำขอที่ขาดผล</option></select></label>
<output id="count" class="status" aria-live="polite">${cards.length} / ${cards.length} กรณี</output></div><div class="grid">${cards.join('\n')}</div>
<footer>ภาพสินค้าบนพื้นเรียบและชิ้นสินค้าที่นำมาประกอบฉากมาจาก <a href="https://dummyjson.com/docs/products">ชุดสินค้าสาธิต DummyJSON</a> ภาพจำลองปรับตำแหน่ง แสง ความคมชัด หรือครอปตามเงื่อนไขทดสอบ</footer></main><script>
const shop=document.getElementById('shop'), statusFilter=document.getElementById('status'), cards=document.querySelectorAll('article')
function update(){let shown=0;for(const card of cards){card.hidden=(shop.value && shop.value!==card.dataset.shop) || (statusFilter.value && !card.dataset.check.split(' ').includes(statusFilter.value));if(!card.hidden)shown++}document.getElementById('count').textContent=shown+' / '+cards.length+' กรณี'}
shop.addEventListener('change',update);statusFilter.addEventListener('change',update)
</script></body></html>`
  await writeFile(path.join(outputDir, 'review.html'), html)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('trials.json', import.meta.url))
  await gallery(JSON.parse(await readFile(file, 'utf8')), path.dirname(file))
}
