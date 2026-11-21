import {
  checkHook,
  type HookContext,
} from '@/services/hook-machine/hook-checks.js'
import { gradeRank, stripEmDash } from '@/services/hook-machine/rubric.js'
import type { HookSet } from '@/services/hook-machine/schemas.js'
import {
  cleanSpoken,
  dedupe,
  engagementCount,
  type Lang,
  mentionsBrand,
  type Offer,
  placeEvenly,
  rehookCount,
  speakSeconds,
  unsupportedNumbers,
  urgencyViolation,
} from '@/services/live-script/checks.js'
import type { LiveShowRaw } from '@/services/live-script/schemas.js'
import type { RunOfShow, SegmentVariant } from '@/services/live-script/types.js'

export type FinalizeContext = {
  language: Lang
  liveMinutes: number
  offer: Offer
  /** Numbers the seller or a sourced fact supplied. Nothing else may appear. */
  allowed: Set<string>
  /** Names of other brands that showed up in research. No line may use them. */
  otherBrands?: string[]
  /** When given, opening hooks also pass the Hook Machine hook checks. */
  hookContext?: HookContext
}

export const SEGMENT_TARGET: [number, number] = [60, 90]
const SEGMENT_WARN_BELOW = 45
const SEGMENT_WARN_ABOVE = 110

const MAX = {
  hooks: 5,
  variants: 4,
  objections: 10,
  transitions: 6,
  closing: 4,
  cues: 12,
}

/**
 * Collects what the checks changed or dropped. The messages are shown to the
 * seller, so they are plain Thai without quotes or dashes.
 */
class Report {
  readonly warnings: string[] = []
  private cleaned = 0

  add(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message)
  }

  noteCleaned() {
    this.cleaned++
  }

  done(): string[] {
    if (this.cleaned) {
      this.warnings.unshift(
        `ล้างเครื่องหมายคำพูด ขีด หรืออีโมจิออกจาก ${this.cleaned} บรรทัด`,
      )
    }
    return this.warnings.slice(0, 30)
  }
}

/** Returns the cleaned line, or null when a hard rule rejects it. */
function vet(
  text: string,
  ctx: FinalizeContext,
  report: Report,
  label: string,
): string | null {
  const cleaned = cleanSpoken(stripEmDash(text), ctx.language)
  if (!cleaned) return null
  if (cleaned !== text.trim()) report.noteCleaned()

  const numbers = unsupportedNumbers(cleaned, ctx.allowed)
  if (numbers.length) {
    report.add(
      `ตัดบรรทัดของ${label}ออก เพราะมีตัวเลข ${numbers.join(' ')} ที่ไม่ได้มาจากข้อมูลที่ให้`,
    )
    return null
  }
  const brand = mentionsBrand(cleaned, ctx.otherBrands ?? [])
  if (brand) {
    report.add(`ตัดบรรทัดของ${label}ออก เพราะเอ่ยชื่อแบรนด์อื่นที่ไม่ใช่สินค้านี้`)
    return null
  }
  const urgency = urgencyViolation(cleaned, ctx.offer)
  if (urgency) {
    report.add(
      `ตัดบรรทัดของ${label}ออก เพราะเร่งให้ซื้อโดยไม่มีข้อมูลสต็อกหรือเวลาสิ้นสุดที่ให้มา`,
    )
    return null
  }
  return cleaned
}

const byGrade = <T extends { grade: Parameters<typeof gradeRank>[0] }>(
  a: T,
  b: T,
) => gradeRank(a.grade) - gradeRank(b.grade)

/** Filler openers, a full stop mid line, too long, or another brand: not a hook. */
function hookPasses(
  text: string,
  ctx: FinalizeContext,
  report: Report,
): boolean {
  if (!ctx.hookContext) return true
  const { hard } = checkHook(text, ctx.hookContext)
  if (hard) {
    report.add(
      'ตัดฮุกเปิดไลฟ์ที่มีคำเกริ่นเปล่า จุดกลางประโยค ยาวเกินไป หรือเอ่ยแบรนด์อื่น',
    )
  }
  return !hard
}

/** Opening hooks follow the Hook Machine rules: no padding, B+ floor for originals. */
export function finalizeHooks(
  raw: HookSet,
  ctx: FinalizeContext,
): { hooks: HookSet; warnings: string[] } {
  const report = new Report()

  const matchedVetted = raw.formatMatched
    // A format hook below C did not really pass the fit screen.
    .filter((h) => gradeRank(h.grade) <= gradeRank('C'))
    .flatMap((h) => {
      const text = vet(h.text, ctx, report, 'ฮุกเปิดไลฟ์')
      return text && hookPasses(text, ctx, report) ? [{ ...h, text }] : []
    })
    .sort(byGrade)
  const matched = dedupe(matchedVetted, (h) => h.text).kept.slice(0, MAX.hooks)

  const originalVetted = raw.original
    .filter((h) => gradeRank(h.grade) <= gradeRank('B+'))
    .flatMap((h) => {
      const text = vet(h.text, ctx, report, 'ฮุกเปิดไลฟ์')
      return text && hookPasses(text, ctx, report) ? [{ ...h, text }] : []
    })
    .sort(byGrade)
  const original = dedupe(
    originalVetted,
    (h) => h.text,
    matched.map((h) => h.text),
  ).kept.slice(0, MAX.hooks)

  if (original.length < 3) {
    report.add('ฮุกเขียนใหม่ที่ผ่านเกณฑ์ได้น้อยกว่าที่ตั้งใจ ลองเพิ่มรายละเอียดสินค้า')
  }
  return {
    hooks: {
      formatMatched: matched,
      skippedFormats: raw.skippedFormats,
      original,
    },
    warnings: report.done(),
  }
}

/** A pitch needs its hook, one call to action and enough lines to be a pitch. */
export function usablePitch(lines: SegmentVariant['lines']): boolean {
  return (
    lines.length >= 3 &&
    lines.some((l) => l.part === 'hook') &&
    lines.some((l) => l.part === 'cta')
  )
}

export function segmentLengthWarning(
  variants: SegmentVariant[],
): string | null {
  return variants.some(
    (v) => v.seconds < SEGMENT_WARN_BELOW || v.seconds > SEGMENT_WARN_ABOVE,
  )
    ? 'บางเซกชันขายสินค้ายาวหรือสั้นกว่า 60 ถึง 90 วินาทีที่ตั้งเป้าไว้'
    : null
}

/**
 * Whole line similarity misses lines that differ at the start but all close
 * with the same invitation. Returns that shared tail when three or more lines
 * end with the same ten or more characters.
 */
export function sharedEnding(
  lines: string[],
  minChars = 10,
  minLines = 3,
): string | null {
  const tails = new Map<string, number>()
  for (const line of lines) {
    const flat = line.replace(/[^\p{L}\p{N}]+/gu, '')
    if (flat.length < minChars) continue
    const tail = flat.slice(-minChars)
    tails.set(tail, (tails.get(tail) ?? 0) + 1)
  }
  for (const [tail, count] of tails) if (count >= minLines) return tail
  return null
}

function variantText(v: { lines: { text: string }[] }): string {
  return v.lines.map((l) => l.text).join(' ')
}

export function finalizeShow(
  raw: LiveShowRaw,
  ctx: FinalizeContext,
  openingHooks: string[],
): { show: RunOfShow; warnings: string[] } {
  const report = new Report()
  const live = ctx.liveMinutes

  /* Re-hooks: the same floor as opening hooks, and never a repeat of an opening hook. */
  const rehooksVetted = raw.rehooks
    .filter((h) => gradeRank(h.grade) <= gradeRank('B+'))
    .flatMap((h) => {
      const text = vet(h.text, ctx, report, 'ฮุกเรียกคนที่เพิ่งเข้ามา')
      return text ? [{ ...h, text }] : []
    })
  const rehooks = dedupe(rehooksVetted, (h) => h.text, openingHooks)
  if (rehooks.dropped.length) {
    report.add(
      `ตัดฮุกเรียกคนที่เพิ่งเข้ามา ${rehooks.dropped.length} บรรทัด เพราะซ้ำกับบรรทัดอื่น`,
    )
  }
  const rehookLines = rehooks.kept.slice(0, rehookCount(live))
  if (sharedEnding(rehookLines.map((h) => h.text))) {
    report.add('ฮุกเรียกคนที่เพิ่งเข้ามาหลายบรรทัดลงท้ายคล้ายกัน ลองสลับคำชวนให้ต่างกันตอนพูด')
  }

  /* Engagement prompts for the chat. */
  const engagementVetted = raw.engagement.flatMap((text) => {
    const line = vet(text, ctx, report, 'คำชวนคุยในแชต')
    return line ? [{ text: line }] : []
  })
  const engagement = dedupe(engagementVetted, (e) => e.text).kept.slice(
    0,
    engagementCount(live),
  )

  /* Product segment: several wordings of one repeatable pitch. */
  const variants: SegmentVariant[] = []
  for (const variant of raw.segment.variants) {
    const lines: SegmentVariant['lines'] = []
    let ctaSeen = false
    for (const line of variant.lines) {
      const text = vet(line.text, ctx, report, 'เซกชันขายสินค้า')
      // A rejected supporting line is skipped. A pitch without its hook or its
      // call to action is caught below.
      if (!text) continue
      if (line.part === 'cta') {
        // One call to action per segment: later asks are removed.
        if (ctaSeen) {
          report.add('ตัดคำชวนซื้อที่เกินหนึ่งครั้งในเซกชันเดียว')
          continue
        }
        ctaSeen = true
      }
      lines.push({ part: line.part, text })
    }
    if (!usablePitch(lines)) {
      report.add('ตัดเซกชันขายสินค้าที่เหลือไม่ครบฮุก คำชวนซื้อ และอย่างน้อยสามบรรทัด')
      continue
    }
    variants.push({
      label:
        cleanSpoken(variant.label, ctx.language) ||
        `แบบที่ ${variants.length + 1}`,
      seconds: speakSeconds(variantText({ lines }), ctx.language),
      lines,
    })
  }
  const segment = dedupe(variants, variantText, [], 0.7).kept.slice(
    0,
    MAX.variants,
  )
  if (!segment.length) report.add('ยังไม่ได้เซกชันขายสินค้าที่ผ่านการตรวจ ลองสร้างใหม่')
  const lengthWarning = segmentLengthWarning(segment)
  if (lengthWarning) report.add(lengthWarning)

  /* Objection bank. */
  const objectionsVetted = raw.objections.flatMap((o) => {
    const answer = vet(o.answer, ctx, report, 'คำตอบข้อสงสัย')
    const ifUnknown = vet(o.ifUnknown, ctx, report, 'คำตอบข้อสงสัย')
    const question = cleanSpoken(o.question, ctx.language)
    return answer && ifUnknown && question
      ? [{ question, answer, ifUnknown }]
      : []
  })
  const objections = dedupe(objectionsVetted, (o) => o.question).kept.slice(
    0,
    MAX.objections,
  )

  /* Transitions and closing. */
  const transitions = raw.transitions
    .flatMap((t) => {
      const text = vet(t.text, ctx, report, 'ประโยคเชื่อม')
      return text ? [{ label: cleanSpoken(t.label, ctx.language), text }] : []
    })
    .slice(0, MAX.transitions)
  const closingVetted = raw.closing.flatMap((text) => {
    const line = vet(text, ctx, report, 'ประโยคปิดไลฟ์')
    return line ? [line] : []
  })
  const closing = dedupe(closingVetted, (c) => c).kept.slice(0, MAX.closing)

  /* Overlay cues: data only, and only for details the seller supplied. */
  const { offer } = ctx
  const cueAllowed = (kind: LiveShowRaw['cues'][number]['kind']) =>
    kind === 'price'
      ? offer.price.trim() !== ''
      : kind === 'promo' || kind === 'gift'
        ? offer.promotion.trim() !== ''
        : kind === 'flash'
          ? offer.stock.trim() !== '' || offer.endsAt.trim() !== ''
          : true
  const seenCues = new Set<string>()
  const cues: RunOfShow['cues'] = []
  for (const cue of raw.cues) {
    const key = `${cue.where}:${cue.kind}`
    if (seenCues.has(key)) continue
    if (!cueAllowed(cue.kind)) {
      report.add(`ตัดสัญญาณป้าย ${cue.kind} ออก เพราะไม่มีข้อมูลข้อเสนอที่เกี่ยวข้อง`)
      continue
    }
    const note = cleanSpoken(cue.note, ctx.language)
    if (!note || unsupportedNumbers(note, ctx.allowed).length) continue
    seenCues.add(key)
    cues.push({ where: cue.where, kind: cue.kind, note })
  }

  return {
    show: {
      rehooks: placeEvenly(rehookLines, live),
      engagement: placeEvenly(engagement, live),
      segment: { targetSeconds: SEGMENT_TARGET, variants: segment },
      objections,
      transitions,
      closing,
      cues: cues.slice(0, MAX.cues),
    },
    warnings: report.done(),
  }
}
