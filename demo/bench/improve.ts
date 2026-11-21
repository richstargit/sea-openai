// Compare accuracy ideas on the 57-frame bench, Choice + image only. Results append to improve-trials.jsonl (cached by fingerprint).
import path from 'node:path'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { benchDir, prepareShop, shops, hash } from './frames.js'
import { jpeg512 } from '../common.js'
import { decisionRequest, selectAnswer, sendDecision } from '../decisions.js'
import { brighten, contrastInstructions, readChoice, rerankRequest, shouldRerank } from './improve-variants.js'

const variants = ['base', 'contrast', 'rerank', 'contrast+rerank'] as const
type Row = { variant: string; shop: string; caseId: string; family: string; label: string; stage1: string; predicted: string; reranked: boolean; latency: number; error: string | null }
const file = path.join(benchDir, 'improve-trials.jsonl')
const cache = new Map<string, Row>()
try { for (const line of (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)) { const r = JSON.parse(line); cache.set(r.key, r.row) } } catch {}
const selected = await Promise.all(shops.map(prepareShop))
const jobs = selected.flatMap(s => s.frames.flatMap(frame => variants.map(variant => ({ s, frame, variant }))))
const rows: Row[] = []
let next = 0
async function stage1(frame: Buffer, catalog: any[], contrast: boolean) {
  const body = decisionRequest(frame, 'choice', catalog, '')
  if (contrast) (body.questions[0] as { instructions: string }).instructions = contrastInstructions
  return selectAnswer(await sendDecision(body), 'choice', catalog)
}
async function worker() {
  while (next < jobs.length) {
    const { s, frame, variant } = jobs[next++]
    const key = hash(variant + '|' + frame.shop + '|' + frame.caseId + '|' + hash(await readFile(path.join(benchDir, 'improve-variants.ts'))) + '|' + hash(await readFile(path.join(benchDir, '../decisions.ts'))))
    const hit = cache.get(key)
    if (hit && !process.argv.includes('--fresh')) { rows.push(hit); continue }
    const contrast = variant.startsWith('contrast')
    const row: Row = { variant, shop: frame.shop, caseId: frame.caseId, family: frame.family, label: frame.label, stage1: '', predicted: '', reranked: false, latency: 0, error: null }
    const start = performance.now()
    try {
      let jpeg = await jpeg512(await readFile(path.join(benchDir, frame.frame)))
      if (contrast) jpeg = await brighten(jpeg)
      const first = await stage1(jpeg, s.catalog, contrast)
      row.stage1 = row.predicted = first.product_id
      const scores = first.probabilities.map(({ id, p }) => ({ id, p }))
      if (variant.includes('rerank') && shouldRerank(first.product_id, first.confidence, scores)) {
        const { body, candidates } = rerankRequest(jpeg, s.catalog, scores)
        if (candidates.length) {
          row.reranked = true
          row.predicted = readChoice(await sendDecision(body as any)).choice
        }
      }
    } catch (e) { row.error = e instanceof Error ? e.message : String(e) }
    row.latency = Math.round(performance.now() - start)
    await appendFile(file, JSON.stringify({ key, row }) + '\n')
    rows.push(row)
    if (rows.length % 25 === 0) console.log('done', rows.length, '/', jobs.length)
  }
}
await Promise.all(Array.from({ length: 4 }, worker))
const lines = ['| วิธี | ถูก | ขึ้นสินค้าผิดตัว | ตอบ none ทั้งที่มีสินค้า | rerank กี่เฟรม | เวลาเฉลี่ย | ช้าสุด |', '|---|---:|---:|---:|---:|---:|---:|']
for (const v of variants) {
  const r = rows.filter(x => x.variant === v)
  const ok = r.filter(x => !x.error && x.predicted === x.label).length
  const wrongSku = r.filter(x => !x.error && x.predicted !== 'none' && x.predicted !== x.label).length
  const missed = r.filter(x => !x.error && x.predicted === 'none' && x.label !== 'none').length
  const lat = r.map(x => x.latency)
  lines.push(`| ${v} | ${ok}/${r.length} | ${wrongSku} | ${missed} | ${r.filter(x => x.reranked).length} | ${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)} ms | ${Math.max(...lat)} ms |`)
}
lines.push('', 'เฟรมที่พลาด:')
for (const v of variants) for (const x of rows.filter(x => x.variant === v && (x.error || x.predicted !== x.label)))
  lines.push(`- ${v} · ${x.shop}/${x.caseId} (${x.family}) เฉลย ${x.label} → ${x.error ? 'error: ' + x.error : x.predicted}${x.reranked ? ' (stage1 ' + x.stage1 + ')' : ''}`)
console.log(lines.join('\n'))
await writeFile(path.join(benchDir, 'improve-results.md'), lines.join('\n') + '\n')
