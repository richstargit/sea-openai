/**
 * Cheap, deterministic checks on spoken lines. The model is asked to follow
 * the rules, and these functions enforce them so a miss never reaches the
 * seller.
 */

import {
  estimateSeconds,
  spokenUnits,
} from '@/services/hook-machine/script-budget.js'

export type Lang = 'th' | 'en'

export type Offer = {
  price: string
  promotion: string
  stock: string
  endsAt: string
}

/* ------------------------------------------------------------- punctuation */

const EMOJI = /\p{Extended_Pictographic}|[️‍]/gu
const DOUBLE_QUOTES = /["“”„‟«»「」『』]/g
// An apostrophe inside a word (don't) is spelling, not a quotation mark.
const SINGLE_QUOTES = /(?<!\p{L})['‘’‚‛`´]|['‘’‚‛`´](?!\p{L})/gu
const DASHES = '-‐‑‒–—―−'
const DASH = new RegExp(`[${DASHES}]`, 'u')

const HAS_DOUBLE_QUOTE = new RegExp(DOUBLE_QUOTES.source, 'u')
const HAS_SINGLE_QUOTE = new RegExp(SINGLE_QUOTES.source, 'u')
const HAS_EMOJI = /\p{Extended_Pictographic}/u

export function bannedPunctuation(text: string): string[] {
  const found: string[] = []
  if (HAS_DOUBLE_QUOTE.test(text) || HAS_SINGLE_QUOTE.test(text))
    found.push('quote')
  if (DASH.test(text)) found.push('dash')
  if (HAS_EMOJI.test(text)) found.push('emoji')
  return found
}

const WORDS = {
  th: { to: 'ถึง', minus: 'ลบ' },
  en: { to: 'to', minus: 'minus' },
} as const

/** Removes quotes, dashes and emoji while keeping the sentence readable. */
export function cleanSpoken(text: string, lang: Lang): string {
  const w = WORDS[lang]
  return text
    .replace(EMOJI, '')
    .replace(DOUBLE_QUOTES, '')
    .replace(SINGLE_QUOTES, '')
    .replace(new RegExp(`(\\d)\\s*[${DASHES}]\\s*(\\d)`, 'gu'), `$1 ${w.to} $2`)
    .replace(new RegExp(`(^|\\s)[${DASHES}](?=\\d)`, 'gu'), `$1${w.minus} `)
    .replace(/\s+[\u2012-\u2015]\s+/gu, ', ')
    .replace(new RegExp(`[${DASHES}]+`, 'gu'), ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/^[\s,]+|[\s,]+$/g, '')
}

/* ------------------------------------------------------------------ numbers */

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'

function asciiDigits(text: string): string {
  return text.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)))
}

/** Numbers as plain strings: 1,299 becomes 1299 and 007 becomes 7. */
export function numbersIn(text: string): string[] {
  const out: string[] = []
  for (const match of asciiDigits(text).matchAll(/\d+(?:[.,]\d+)*/g)) {
    const raw = match[0].replace(/,(?=\d{3}\b)/g, '')
    const [whole = '0', fraction] = raw.split('.')
    out.push(
      fraction === undefined
        ? String(Number(whole.replace(/,/g, '')))
        : `${Number(whole.replace(/,/g, ''))}.${fraction}`,
    )
  }
  return out
}

export function allowedNumbers(sources: string[]): Set<string> {
  const set = new Set<string>()
  for (const source of sources) for (const n of numbersIn(source)) set.add(n)
  return set
}

// 1 to 3 may be counting words (three tips) unless a unit makes them a claim.
const CLAIM_UNIT =
  /^\s*(?:บาท|฿|%|เปอร์เซ็นต์|ชิ้น|ตัว|ชุด|นาที|ชั่วโมง|วัน|baht|percent|pieces?|units?|minutes?|hours?|days?|off\b)/iu

/** Numbers in the line that neither the seller nor a sourced fact supplied. */
export function unsupportedNumbers(
  text: string,
  allowed: Set<string>,
): string[] {
  const ascii = asciiDigits(text)
  const bad: string[] = []
  for (const match of ascii.matchAll(/\d+(?:[.,]\d+)*/g)) {
    const n = numbersIn(match[0])[0]
    if (n === undefined || allowed.has(n)) continue
    const index = match.index ?? 0
    const after = ascii.slice(index + match[0].length)
    const before = ascii.slice(Math.max(0, index - 1), index)
    const counting = Number(n) >= 0 && Number(n) <= 3 && !/[฿$]/.test(before)
    if (counting && !CLAIM_UNIT.test(after)) continue
    bad.push(n)
  }
  return [...new Set(bad)]
}

/* ------------------------------------------------------------------ urgency */

const STOCK_WORDS =
  /เหลือ|ใกล้หมด|หมดแล้ว|สต็อก|สต๊อก|จำนวนจำกัด|ของหมด|\bonly\b[^.!?]{0,12}\bleft\b|almost gone|limited (?:stock|quantity)|selling out|last (?:few|ones?)/iu
const TIME_WORDS =
  /หมดเขต|วันนี้เท่านั้น|ก่อนเที่ยง|จนถึง|นับถอยหลัง|\bends?\b|today only|until\b|deadline|countdown|flash/iu
const GENERIC_WORDS =
  /รีบ|ด่วน|ห้ามพลาด|พลาดไม่ได้|โอกาสสุดท้าย|ตอนนี้เท่านั้น|hurry|don'?t miss|last chance|act now|running out/iu

/** Urgency is allowed only when the seller supplied the matching detail. */
export function urgencyViolation(text: string, offer: Offer): string | null {
  const stock = offer.stock.trim()
  const ends = offer.endsAt.trim()
  const promo = offer.promotion.trim()
  if (STOCK_WORDS.test(text) && !stock)
    return 'urgency about stock without stock details'
  if (TIME_WORDS.test(text) && !ends)
    return 'urgency about time without an end time'
  if (GENERIC_WORDS.test(text) && !stock && !ends && !promo) {
    return 'urgency without any offer detail'
  }
  return null
}

/* ------------------------------------------------------------ repeated text */

function shingles(text: string, size = 3): Set<string> {
  const flat = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const set = new Set<string>()
  if (flat.length <= size) {
    if (flat) set.add(flat)
    return set
  }
  for (let i = 0; i <= flat.length - size; i++) set.add(flat.slice(i, i + size))
  return set
}

/** Share of character triples two lines have in common, 0 to 1. Works for Thai, which has no spaces. */
export function similarity(a: string, b: string): number {
  const x = shingles(a)
  const y = shingles(b)
  if (!x.size || !y.size) return 0
  let shared = 0
  for (const s of x) if (y.has(s)) shared++
  return shared / (x.size + y.size - shared)
}

export const SIMILARITY_LIMIT = 0.6

/** Keeps the first of any near duplicates, also against lines already used elsewhere. */
export function dedupe<T>(
  items: T[],
  text: (item: T) => string,
  against: string[] = [],
  limit = SIMILARITY_LIMIT,
): { kept: T[]; dropped: T[] } {
  const seen = [...against]
  const kept: T[] = []
  const dropped: T[] = []
  for (const item of items) {
    const line = text(item)
    if (seen.some((other) => similarity(line, other) >= limit))
      dropped.push(item)
    else {
      kept.push(item)
      seen.push(line)
    }
  }
  return { kept, dropped }
}

/* --------------------------------------------------------------------- time */

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export const rehookCount = (liveMinutes: number) =>
  clamp(Math.floor(liveMinutes / 6), 4, 10)
export const engagementCount = (liveMinutes: number) =>
  clamp(Math.floor(liveMinutes / 10), 3, 8)

/** Minutes at which to place count items evenly across the stream. */
export function spreadMinutes(count: number, liveMinutes: number): number[] {
  const out: number[] = []
  for (let i = 1; i <= count; i++) {
    const minute = Math.round((i * liveMinutes) / (count + 1))
    const last = out[out.length - 1]
    out.push(
      last !== undefined && minute <= last ? last + 1 : Math.max(1, minute),
    )
  }
  return out
}

export function placeEvenly<T>(
  items: T[],
  liveMinutes: number,
): (T & { atMinute: number })[] {
  const minutes = spreadMinutes(items.length, liveMinutes)
  return items.map((item, i) => ({
    ...item,
    atMinute: minutes[i] ?? liveMinutes,
  }))
}

/**
 * Spoken length of a text in seconds, from the speaking rate measured for each
 * language (the same rate the video script budget uses).
 */
export function speakSeconds(text: string, lang: Lang): number {
  return Math.round(estimateSeconds(spokenUnits(text, lang), lang))
}

/* ------------------------------------------------------------ other brands */

/**
 * A line may not name another brand that showed up in the web research. Latin
 * names match as whole words so a short name never hits inside a longer word.
 */
export function mentionsBrand(text: string, brands: string[]): string | null {
  const lower = text.toLowerCase()
  for (const brand of brands) {
    const name = brand.trim().toLowerCase()
    if (name.length < 3) continue
    if (/^[a-z0-9 ]+$/.test(name)) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(lower))
        return brand
    } else if (lower.includes(name)) return brand
  }
  return null
}
