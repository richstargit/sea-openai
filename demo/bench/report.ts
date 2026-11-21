import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Trial } from './types.js'

const methods = ['choice', 'reference'] as const
const inputs = ['image', 'caption'] as const
const arms = methods.flatMap(method => inputs.map(input => ({ method, input })))
const caseKey = (t: Trial) => JSON.stringify([t.shop, t.caseId, t.family])
const armKey = (t: Pick<Trial, 'method' | 'input'>) => t.method + '/' + t.input
const answered = (t: Trial) => t.error === null && t.predicted !== null
const correct = (t: Trial) => answered(t) && t.predicted === t.label

function rate(n: number, total: number) {
  return total ? n + '/' + total + ' (' + (100 * n / total).toFixed(1) + '%)' : '—'
}
function choiceStats(trials: Trial[]) {
  const ok = trials.filter(answered)
  const positive = ok.filter(t => t.label !== 'none')
  const negative = ok.filter(t => t.label === 'none')
  return [
    rate(trials.filter(correct).length, trials.length),
    rate(positive.filter(correct).length, positive.length),
    rate(negative.filter(t => t.predicted !== 'none').length, negative.length),
    rate(positive.filter(t => t.predicted === 'none').length, positive.length),
    rate(positive.filter(t => t.predicted !== 'none' && !correct(t)).length, positive.length),
    trials.length - ok.length,
  ]
}
function latency(trials: Trial[]) {
  if (!trials.length) return ['—', '—']
  const values = trials.map(t => t.latency).sort((a, b) => a - b)
  return [Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), values[Math.ceil(values.length * 0.95) - 1]]
}
function unique(trials: Trial[], field: 'shop' | 'family') {
  return [...new Set(trials.map(t => t[field]))].sort()
}
function table(lines: string[], columns: string[], rows: (string | number)[][]) {
  const line = (cells: (string | number)[]) =>
    '| ' + cells.map(cell => String(cell).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ')).join(' | ') + ' |'
  lines.push(line(columns), line(columns.map(() => '---')), ...rows.map(line), '')
}
const metricHeaders = ['ตอบถูก/คำขอ', 'SKU ถูก/เฟรมมีสินค้า', 'เลือก SKU/เฟรม none', 'พลาดเป็น none/เฟรมมีสินค้า', 'สลับ SKU/เฟรมมีสินค้า', 'Errors']

/** Regenerate the report using the captured trials. No network or model access is needed. */
export async function report(trials: Trial[], outputDir: string): Promise<void> {
  const cases = new Map<string, Map<string, Trial>>()
  for (const trial of trials) {
    const key = caseKey(trial)
    const group = cases.get(key) ?? new Map<string, Trial>()
    if (group.has(armKey(trial))) throw new Error('พบผลซ้ำสำหรับ ' + key + ' ' + armKey(trial))
    group.set(armKey(trial), trial)
    cases.set(key, group)
  }
  const completed = new Set([...cases].filter(([, group]) =>
    arms.every(arm => { const t = group.get(armKey(arm)); return t !== undefined && answered(t) })
  ).map(([key]) => key))
  const sources = new Set(trials.map(t => JSON.stringify([t.shop, t.sourceId])))
  const lines = [
    '# ผลทดสอบร้านจำลอง', '',
    'ร้าน ' + unique(trials, 'shop').length + ' ร้าน · ต้นทางที่นับแยกร้าน ' + sources.size + ' กลุ่ม (รวมฉากว่างจำลอง) · กรณีทดสอบ '
      + cases.size + ' กรณี · คำขอ ' + trials.length + ' ครั้ง',
    '',
    'กรณีที่เปลี่ยนตำแหน่ง ขนาด หรือข้อความจากภาพต้นทางเดียวกันมีความสัมพันธ์กัน ควรวัดซ้ำด้วยเฟรมไลฟ์คนละช่วงก่อนใช้คะแนนเหล่านี้ตัดสินใจเปิดขายอัตโนมัติ',
    '',
    '## เปรียบเทียบ 4 แบบบนเฟรมเดียวกัน', '',
    'มีผลครบทั้ง 4 แบบบน ' + completed.size + '/' + cases.size + ' กรณี '
      + 'image ใช้ภาพล้วน ส่วน caption ส่งภาพกับข้อความที่กำกับกรณีนั้น เวลาเฉลี่ยและ p95 วัดเป็นมิลลิวินาที โดย p95 ใช้ลำดับที่ปัดขึ้น',
    '',
  ]
  const sameFrames = trials.filter(t => completed.has(caseKey(t)))
  table(lines, ['วิธี', 'อินพุต', ...metricHeaders, 'เฉลี่ย ms', 'p95 ms'], arms.map(arm => {
    const items = sameFrames.filter(t => armKey(t) === armKey(arm))
    return [arm.method, arm.input, ...choiceStats(items), ...latency(items)]
  }))
  lines.push(
    '## ทุกคำขอ', '',
    'คอลัมน์ตอบถูก/คำขอนับ error ในตัวหาร คอลัมน์วิเคราะห์ข้อผิดพลาด SKU ใช้เฉพาะคำขอที่ได้ผลทำนาย เครื่องหมาย — หมายถึงไม่มีตัวอย่างสำหรับตัวหารนั้น', '',
  )
  table(lines, ['วิธี', 'อินพุต', ...metricHeaders, 'เฉลี่ย ms', 'p95 ms'], arms.map(arm => {
    const items = trials.filter(t => armKey(t) === armKey(arm))
    return [arm.method, arm.input, ...choiceStats(items), ...latency(items)]
  }))
  for (const field of ['shop', 'family'] as const) {
    const heading = field === 'shop' ? 'ร้าน' : 'สภาพภาพและข้อความ'
    lines.push('## แยกตาม' + heading, '')
    table(lines, [heading, 'วิธี', 'อินพุต', ...metricHeaders],
      unique(trials, field).flatMap(value => arms.map(arm => {
        const items = trials.filter(t => t[field] === value && armKey(t) === armKey(arm))
        return [value, arm.method, arm.input, ...choiceStats(items)]
      })))
  }

  lines.push('## การยกสินค้าให้กล้องดู', '',
    'คำนวณจากกรณีที่ระบุเฉลย held_up และได้รับคำตอบ ค่าแถวไม่มีตัวอย่างจะแสดง —', '')
  table(lines, ['วิธี', 'อินพุต', 'ทายว่ายกถูก/ยกจริง', 'ทายว่าไม่ยกถูก/ไม่ได้ยกจริง', 'ทายว่ายกผิด/ไม่ได้ยกจริง'], arms.map(arm => {
    const items = trials.filter(t => armKey(t) === armKey(arm) && answered(t) && t.held !== null)
    const yes = items.filter(t => t.expectedHeld === true)
    const no = items.filter(t => t.expectedHeld === false)
    return [arm.method, arm.input, rate(yes.filter(t => t.held).length, yes.length),
      rate(no.filter(t => !t.held).length, no.length), rate(no.filter(t => t.held).length, no.length)]
  }))

  type Pair = { image: Trial; caption: Trial }
  const pairs: Pair[] = []
  for (const group of cases.values()) {
    for (const method of methods) {
      const image = group.get(method + '/image')
      const caption = group.get(method + '/caption')
      if (image && caption && answered(image) && answered(caption)) pairs.push({image, caption})
    }
  }
  lines.push('## ผลของข้อความประกอบ', '',
    'เทียบคำทำนายเป็นคู่ภายในวิธีเดียวกัน เฉพาะคู่ที่ได้คำตอบทั้งสองครั้ง', '')
  table(lines, ['วิธี', 'สภาพ', 'คู่', 'คำตอบเปลี่ยน', 'ผิด → ถูก', 'ถูก → ผิด', 'ผิด → ผิดตัวอื่น'],
    methods.flatMap(method => ['รวม', ...unique(trials, 'family')].map(family => {
      const group = pairs.filter(({image}) => image.method === method && (family === 'รวม' || image.family === family))
      const flips = group.filter(p => p.image.predicted !== p.caption.predicted)
      return [method, family, group.length, flips.length, flips.filter(p => correct(p.caption)).length,
        flips.filter(p => correct(p.image)).length, flips.filter(p => !correct(p.image) && !correct(p.caption)).length]
    })))
  const flips = pairs.filter(p => p.image.predicted !== p.caption.predicted)
  if (flips.length) table(lines, ['ร้าน/กรณี', 'สภาพ', 'วิธี', 'เฉลย', 'ภาพ', 'ภาพ+ข้อความ', 'ข้อความ'],
    flips.map(({image, caption}) => [image.shop + '/' + image.caseId, image.family, image.method,
      image.label, image.predicted!, caption.predicted!, caption.text]))

  lines.push('## ตัวอย่างที่ตอบผิดด้วยความมั่นใจสูง', '',
    'เรียงตามค่า confidence ภายในวิธีเดียวกัน สูงสุดวิธีละ 5 คำขอ กรณี Reference ตอบ none จะไม่มีค่า confidence', '')
  const mistakes = trials.filter(t => answered(t) && !correct(t) && t.confidence !== null)
  if (mistakes.length) table(lines, ['วิธี', 'อินพุต', 'ร้าน/กรณี', 'สภาพ', 'เฉลย', 'ทำนาย', 'ความมั่นใจ'],
    methods.flatMap(method => mistakes.filter(t => t.method === method)
      .sort((a, b) => b.confidence! - a.confidence!).slice(0, 5).map(t =>
        [t.method, t.input, t.shop + '/' + t.caseId, t.family, t.label, t.predicted!, (100 * t.confidence!).toFixed(1) + '%'])))
  else lines.push('ไม่มีคำตอบผิดที่มีค่า confidence ในชุดนี้', '')
  const errors = trials.filter(t => !answered(t))
  if (errors.length) {
    lines.push('## คำขอที่ไม่ได้คำทำนาย', '')
    table(lines, ['ร้าน/กรณี', 'สภาพ', 'วิธี', 'อินพุต', 'ข้อความ'], errors.map(t =>
      [t.shop + '/' + t.caseId, t.family, t.method, t.input, t.error ?? 'ไม่มีรหัสผลทำนาย']))
  }
  await mkdir(outputDir, {recursive: true})
  await writeFile(path.join(outputDir, 'results.md'), lines.join('\n') + '\n')
}
