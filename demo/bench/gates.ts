import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { Trial } from './types.js'

type Pair = { sample: Trial; choice?: Trial; reference?: Trial }
const policies = ['choice', 'agreement', 'agreement-score-gap'] as const
type Policy = typeof policies[number]
const minProbability = 0.80
const minMargin = 0.15

function displayedProduct(pair: Pair, policy: Policy) {
  const { choice, reference } = pair
  const selected = choice?.predicted
  if (!selected || selected === 'none' || choice?.error) return null
  if (policy === 'choice') return selected
  if (!reference || reference.error || reference.predicted !== selected) return null
  if (policy === 'agreement') return selected
  const ordered = [...reference.scores].sort((a, b) => b.p - a.p)
  const winner = ordered[0]
  if (!winner || winner.id !== selected || winner.p < minProbability) return null
  // A single stocked product has no competing SKU. Use zero for its runner-up.
  const margin = winner.p - (ordered[1]?.p ?? 0)
  return margin + Number.EPSILON >= minMargin ? selected : null
}

function rate(n: number, total: number) {
  return total ? n + '/' + total + ' (' + (100 * n / total).toFixed(1) + '%)' : '—'
}

/** Replay display rules over the same saved frames. An unavailable decision produces a review. */
export async function policyReport(trials: Trial[], outputDir: string) {
  const groups = new Map<string, Pair>()
  for (const trial of trials) {
    const key = JSON.stringify([trial.shop, trial.caseId, trial.family, trial.input])
    const group: Pair = groups.get(key) ?? {sample: trial}
    if (group[trial.method] || trial.label !== group.sample.label || trial.frame !== group.sample.frame)
      throw new Error('ผลทดสอบซ้ำหรือเฟรมกับเฉลยของคู่นี้ไม่ตรงกัน ' + key)
    group[trial.method] = trial
    groups.set(key, group)
  }
  const lines = [
    '# การจำลองเงื่อนไขขึ้นสินค้าบนจอ', '',
    'กำหนดกติกาก่อนดูผลลัพธ์ แล้วคำนวณซ้ำจาก trials.json บนเฟรมชุดเดียวกัน ผล review หมายถึงพักการขึ้นป้ายสินค้าอัตโนมัติ รวมกรณีที่โมเดลตอบ none หรือคำขอที่จำเป็นไม่มีผล',
    '',
    '- **choice** ขึ้น SKU ที่ Choice เลือกทันที',
    '- **agreement** ขึ้น SKU เมื่อ Choice และ Reference ตรงกันและเป็นสินค้าในร้าน',
    '- **agreement-score-gap** เพิ่มเงื่อนไขให้คะแนน Reference ของสินค้าที่ตรงกัน ≥ 0.80 และนำอันดับสอง ≥ 0.15 (15 จุดเปอร์เซ็นต์) ถ้ามีสินค้าเดียวให้นับอันดับสองเป็นศูนย์',
    '',
    '| นำเข้า | กติกา | ขึ้นป้าย/ทุกเฟรม | ถูก/ขึ้นป้าย (precision) | ขึ้นผิดทั้งหมด | สลับ SKU | ขึ้นผิดบน none | ขึ้นถูก/เฟรมมีสินค้า | review ทั้งหมด | review ที่เฉลยเป็น none |',
    '| --- | --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: |',
  ]
  const errors: string[] = []
  for (const input of ['image', 'caption'] as const) {
    const pairs = [...groups.values()].filter(p => p.sample.input === input)
    const positives = pairs.filter(p => p.sample.label !== 'none').length
    for (const policy of policies) {
      let shown = 0, right = 0, wrongSku = 0, falseDisplay = 0, absentReview = 0
      for (const pair of pairs) {
        const id = displayedProduct(pair, policy)
        const { shop, caseId, family, label } = pair.sample
        if (id === null) {
          if (label === 'none') absentReview++
          continue
        }
        shown++
        if (id === label) right++
        else {
          if (label === 'none') falseDisplay++
          else wrongSku++
          errors.push([input, policy, shop + '/' + caseId, family, label, id].join(' | '))
        }
      }
      lines.push('| ' + [input, policy, rate(shown, pairs.length), rate(right, shown),
        falseDisplay + wrongSku, wrongSku, falseDisplay, rate(right, positives), pairs.length - shown, absentReview].join(' | ') + ' |')
    }
  }
  lines.push('', '## เวลาตอบสนองในไลฟ์', '',
    'Choice ใช้หนึ่งคำขอต่อเฟรม กติกาที่ให้สองวิธีเห็นตรงกันต้องรอคำตอบสองคำขอ ถ้าส่งพร้อมกัน ระยะรอขึ้นป้ายขึ้นอยู่กับคำขอที่ช้าที่สุด รวมค่าคิวและเวลาประมวลผลของระบบ งานนี้วัดเวลาแต่ละคำขอแยกกัน เวลารวมของการส่งคู่พร้อมกันต้องวัดในระบบไลฟ์อีกครั้ง', '')
  if (errors.length) {
    lines.push('## เฟรมที่จำลองแล้วขึ้นป้ายผิด', '',
      '| นำเข้า | กติกา | ร้าน/กรณี | สภาพ | เฉลย | SKU บนจอ |', '| --- | --- | --- | --- | --- | --- |',
      ...errors.map(e => '| ' + e + ' |'), '')
  }
  await writeFile(path.join(outputDir, 'policy.md'), lines.join('\n') + '\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL('trials.json', import.meta.url))
  await policyReport(JSON.parse(await readFile(input, 'utf8')), path.dirname(input))
  console.log(path.join(path.dirname(input), 'policy.md'))
}
