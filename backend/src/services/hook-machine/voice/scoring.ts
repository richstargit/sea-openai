import type { LanguageInfo } from '@/services/hook-machine/voice/catalog.js'
import type { WavInfo } from '@/services/hook-machine/voice/wav.js'

// Pure helpers. Nothing here calls a network or the file system.

const clamp = (value: number, lo = 0, hi = 100) =>
  Math.min(hi, Math.max(lo, value))

/* ------------------------------------------------------------ text compare */

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

type Kind = 'start' | 'ones' | 'teens' | 'tens' | 'hundred' | 'thousand'

// Which kind of number word may follow which, so spelled digits such as
// one two three stay separate while forty three becomes one number.
const FOLLOWS: Record<Kind, Kind[]> = {
  start: ['ones', 'teens', 'tens', 'hundred', 'thousand'],
  ones: ['hundred', 'thousand'],
  teens: ['hundred', 'thousand'],
  tens: ['ones', 'thousand'],
  hundred: ['ones', 'teens', 'tens', 'thousand'],
  thousand: ['ones', 'teens', 'tens', 'hundred'],
}

function kindOf(word: string): Kind | null {
  if (word in ONES) return (ONES[word] as number) < 10 ? 'ones' : 'teens'
  if (word in TENS) return 'tens'
  if (word === 'hundred') return 'hundred'
  if (word === 'thousand') return 'thousand'
  return null
}

/** Turns runs of English number words into digits, so forty three equals 43. */
export function numberWordsToDigits(text: string): string {
  const words = text.split(' ')
  const out: string[] = []
  let i = 0
  while (i < words.length) {
    const first = words[i] ?? ''
    if (kindOf(first) === null) {
      out.push(first)
      i++
      continue
    }
    let total = 0
    let current = 0
    let last: Kind = 'start'
    while (i < words.length) {
      let w = words[i] ?? ''
      // "two hundred and five": skip the and only when a number really follows.
      if (w === 'and' && last !== 'start') {
        const afterAnd = kindOf(words[i + 1] ?? '')
        if (afterAnd && FOLLOWS[last].includes(afterAnd)) {
          i++
          w = words[i] ?? ''
        } else break
      }
      const kind = kindOf(w)
      if (!kind || !FOLLOWS[last].includes(kind)) break
      if (kind === 'ones' || kind === 'teens') current += ONES[w] as number
      else if (kind === 'tens') current += TENS[w] as number
      else if (kind === 'hundred') current = (current || 1) * 100
      else {
        total += (current || 1) * 1000
        current = 0
      }
      last = kind
      i++
    }
    out.push(String(total + current))
  }
  return out.join(' ')
}

/** Lowercase, drop punctuation and digit grouping, collapse space. */
export function normalizeText(text: string, languageCode: string): string {
  let t = text.toLowerCase().normalize('NFKC')
  t = t.replace(/(\d)[,\s](?=\d{3}\b)/g, '$1')
  t = t.replace(/[\p{P}\p{S}]/gu, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  if (languageCode === 'en') t = numberWordsToDigits(t)
  return t
}

function editDistance<T>(a: T[], b: T[]): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] as number
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] as number
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      prev[j] = Math.min(
        above + 1,
        (prev[j - 1] as number) + 1,
        diagonal + cost,
      )
      diagonal = above
    }
  }
  return prev[b.length] as number
}

export function wordErrorRate(expected: string, heard: string): number {
  const a = expected.split(' ').filter(Boolean)
  const b = heard.split(' ').filter(Boolean)
  if (a.length === 0) return b.length === 0 ? 0 : 1
  return editDistance(a, b) / a.length
}

export function charErrorRate(expected: string, heard: string): number {
  const a = [...expected.replace(/\s/g, '')]
  const b = [...heard.replace(/\s/g, '')]
  if (a.length === 0) return b.length === 0 ? 0 : 1
  return editDistance(a, b) / a.length
}

/** Error rate between the script and what a transcriber heard. 0 is perfect. */
export function errorRate(
  expected: string,
  heard: string,
  language: LanguageInfo,
): number {
  const e = normalizeText(expected, language.code)
  const h = normalizeText(heard, language.code)
  return language.unit === 'chars' ? charErrorRate(e, h) : wordErrorRate(e, h)
}

export function intelligibilityScore(rate: number): number {
  return clamp(Math.round((1 - rate) * 100))
}

/* ------------------------------------------------------------------ pacing */

/** Words or characters in the spoken text, depending on the script. */
export function speechUnits(text: string, language: LanguageInfo): number {
  const t = normalizeText(text, language.code)
  return language.unit === 'chars'
    ? [...t.replace(/\s/g, '')].length
    : t.split(' ').filter(Boolean).length
}

export function rateScore(rate: number, band: [number, number]): number {
  const [lo, hi] = band
  if (rate >= lo && rate <= hi) return 100
  const distance = rate < lo ? lo - rate : rate - hi
  return clamp(Math.round(100 - (distance / (hi - lo)) * 100))
}

export function durationFitScore(
  durationSec: number,
  targetSec: number,
): number {
  if (targetSec <= 0) return 100
  const off = Math.abs(durationSec - targetSec) / targetSec
  if (off <= 0.15) return 100
  return clamp(Math.round(100 - ((off - 0.15) / 0.45) * 100))
}

export function pacingScore(args: {
  text: string
  durationSec: number
  targetSec: number
  language: LanguageInfo
}): { score: number; rate: number } {
  const units = speechUnits(args.text, args.language)
  const rate = args.durationSec > 0 ? units / args.durationSec : 0
  const score =
    0.65 * rateScore(rate, args.language.band) +
    0.35 * durationFitScore(args.durationSec, args.targetSec)
  return { score: Math.round(score), rate: Math.round(rate * 100) / 100 }
}

/* --------------------------------------------------------------- technical */

const WINDOW_SEC = 0.02
const SILENCE_DBFS = -45
const CLIP_LEVEL = 32_700

export function waveStats(wav: WavInfo): {
  silenceRatio: number
  clipRatio: number
} {
  const size = Math.max(1, Math.floor(wav.sampleRate * WINDOW_SEC))
  const windows = Math.floor(wav.samples.length / size)
  if (windows === 0) return { silenceRatio: 1, clipRatio: 0 }
  let silent = 0
  for (let w = 0; w < windows; w++) {
    let sum = 0
    for (let i = w * size; i < (w + 1) * size; i++) {
      const s = (wav.samples[i] as number) / 32768
      sum += s * s
    }
    const dbfs = 20 * Math.log10(Math.sqrt(sum / size) || 1e-9)
    if (dbfs < SILENCE_DBFS) silent++
  }
  let clipped = 0
  for (const s of wav.samples) if (Math.abs(s) >= CLIP_LEVEL) clipped++
  return {
    silenceRatio: silent / windows,
    clipRatio: clipped / wav.samples.length,
  }
}

export function technicalScore(
  silenceRatio: number,
  clipRatio: number,
): number {
  const silence =
    silenceRatio <= 0.3 ? 100 : clamp(100 - ((silenceRatio - 0.3) / 0.35) * 100)
  const clip = clamp(100 - (clipRatio / 0.005) * 100)
  return Math.round(0.6 * silence + 0.4 * clip)
}

/* --------------------------------------------------------------- composite */

export const WEIGHTS = {
  intelligibility: 40,
  pacing: 25,
  style: 25,
  technical: 10,
} as const

/**
 * Weighted mean 0 to 100. A part that could not be measured (the AI judge or
 * the transcriber failed) is dropped and the weights of the rest are scaled up.
 */
export function compositeScore(parts: {
  intelligibility: number | null
  pacing: number
  style: number | null
  technical: number
}): number {
  let total = 0
  let weight = 0
  for (const key of [
    'intelligibility',
    'pacing',
    'style',
    'technical',
  ] as const) {
    const value = parts[key]
    if (value === null) continue
    total += value * WEIGHTS[key]
    weight += WEIGHTS[key]
  }
  return weight === 0 ? 0 : Math.round(total / weight)
}

/** Judge answers are 1 to 5 for style fit and naturalness. */
export function styleScoreFromJudge(fit: number, natural: number): number {
  return clamp(Math.round((((fit + natural) / 2 - 1) / 4) * 100))
}
