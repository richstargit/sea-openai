// Cheap, deterministic checks for a spoken hook. The model writes and grades
// hooks, but it grades its own work generously, so these catch the faults
// that were seen in real runs: filler openers and closers, two sentences with
// a full stop in the middle, hooks that are too long to say in about three
// seconds, numbers nobody supplied, and other brands' names.

import { type Grade, gradeRank } from '@/services/hook-machine/rubric.js'
import { spokenUnits } from '@/services/hook-machine/script-budget.js'

const FILLER: RegExp[] = [
  /\blet'?s (take a )?look\b/i,
  /\btake a look\b/i,
  /\bcheck (it|this|that) out\b/i,
  /\bwatch (this|till|until)\b/i,
  /\bhere'?s (the|a) (thing|deal|story)\b/i,
  /\ball right\b/i,
  /\bso basically\b/i,
  /\bin this video\b/i,
  /\b(see|check|read) the (details|description)\b/i,
  /\bdetails? (below|in the description)\b/i,
  /\byou (need|have) to see\b/i,
  /มาดูรายละเอียด/,
  /ลองดูรายละเอียด/,
  /ดูรายละเอียดสินค้า/,
  /ดูรายละเอียดกัน/,
  /ดูให้ดีนะ/,
  /ลองมาดูกัน/,
  /มาดูกันเลย/,
  /เดี๋ยวมาดูกัน/,
  /ตามมาดู/,
  /ไปดูกัน/,
  /ชวนดูรายละเอียด/,
]

export const isFillerSentence = (sentence: string): boolean =>
  FILLER.some((pattern) => pattern.test(sentence))

/** Words that end in a full stop without ending a sentence. */
const ABBREVIATIONS = new Set([
  'มล',
  'กก',
  'ซม',
  'มม',
  'ลบ',
  'ตร',
  'ml',
  'mg',
  'kg',
  'cm',
  'mm',
  'vs',
  'etc',
  'inc',
  'dr',
  'mr',
  'ms',
  'no',
])

/** Splits at sentence ends that are followed by more text. */
export function splitSentences(text: string): string[] {
  const out: string[] = []
  let start = 0
  const pattern = /([.!?])(\s+)(?=\S)/g
  for (const match of text.matchAll(pattern)) {
    const end = (match.index ?? 0) + 1
    const before = text.slice(start, end - 1)
    const word = (before.match(/(\S+)$/)?.[1] ?? '').toLowerCase()
    const bare = word.replace(/[^\p{L}]/gu, '')
    // A full stop after a unit like มล or an initial is not a sentence end.
    if (match[1] === '.' && (ABBREVIATIONS.has(bare) || bare.length < 2))
      continue
    // A decimal point has no space after it, so it never reaches here.
    out.push(text.slice(start, end).trim())
    start = end + (match[2]?.length ?? 0)
  }
  const rest = text.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

export const hasMidSentenceStop = (text: string): boolean =>
  splitSentences(text.trim()).length > 1

/**
 * Backstop for what the prompt asked for: one sentence, no filler, no full stop
 * at the end. The first sentence that is not filler is kept.
 */
export function tidyHook(text: string): string {
  const flat = text
    .replace(/[…]|\.{3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const sentences = splitSentences(flat)
  const kept = sentences.filter((s) => !isFillerSentence(s))
  const first = (kept[0] ?? sentences[0] ?? flat).trim()
  return first.replace(/[.!]+$/u, '').trim()
}

/** The most a hook may say. About three seconds of speech with some room. */
export const HOOK_LIMIT: Record<string, number> = { en: 20, th: 55 }

export type HookContext = {
  languageCode: string
  productName: string | null
  /** Everything the hook may rely on: typed notes, photo facts, verified web facts, selling points. */
  supportText: string
  /** Names of other brands that showed up in research. A hook must not use them. */
  otherBrands?: string[]
  /** Short phrases from the selling points, used to see whether the payoff is named. */
  payoffTerms?: string[]
}

export type HookIssue =
  | 'filler'
  | 'midStop'
  | 'tooLong'
  | 'unsupportedNumber'
  | 'competitorBrand'
  | 'notNamed'

const HARD: HookIssue[] = [
  'filler',
  'midStop',
  'tooLong',
  'unsupportedNumber',
  'competitorBrand',
]

const digitsOf = (text: string): string[] =>
  (
    text.replace(/(\d)[,\s](?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []
  ).map((n) => n.replace(/^0+(?=\d)/, ''))

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,;/]+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((t) => t.length >= 3)
}

/** A Latin brand must match as a whole word, so gel does not hit energel. */
function mentions(lowerText: string, brand: string): boolean {
  const name = brand.trim().toLowerCase()
  if (name.length < 3) return false
  if (/^[a-z0-9 ]+$/.test(name)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(lowerText)
  }
  return lowerText.includes(name)
}

export function checkHook(
  text: string,
  context: HookContext,
): { issues: HookIssue[]; hard: boolean } {
  const issues: HookIssue[] = []
  if (isFillerSentence(text)) issues.push('filler')
  if (hasMidSentenceStop(text)) issues.push('midStop')

  const limit = HOOK_LIMIT[context.languageCode] ?? 20
  if (spokenUnits(text, context.languageCode) > limit) issues.push('tooLong')

  const support = digitsOf(context.supportText)
  const supportSet = new Set(support)
  const unsupported = digitsOf(text).some((n) => !supportSet.has(n))
  if (unsupported) issues.push('unsupportedNumber')

  const lower = text.toLowerCase()
  if ((context.otherBrands ?? []).some((brand) => mentions(lower, brand))) {
    issues.push('competitorBrand')
  }

  const names = tokens(context.productName ?? '')
  const payoff = (context.payoffTerms ?? []).flatMap(tokens)
  const named =
    names.some((t) => lower.includes(t)) ||
    payoff.some((t) => lower.includes(t))
  if (!named && (names.length > 0 || payoff.length > 0)) issues.push('notNamed')

  return { issues, hard: issues.some((i) => HARD.includes(i)) }
}

export type HookCandidate = {
  text: string
  grade: Grade
  /** Hooks adapted from a profile format get a small bonus: that is the style the user asked for. */
  source: 'format' | 'original'
}

const CONTRAST =
  /\b(but|without|instead|before|why|how|never|only|vs)\b|แต่|ไม่ต้อง|โดยไม่|ทำไม|ยังไง|แทน|เหลือแค่|แค่|ก่อน/i

/**
 * The explicit rule for choosing the hook: it must pass the hard checks;
 * then the best grade wins, with a bonus for a number, for naming the product
 * or its payoff, for a contrast or a curiosity gap, and for coming from the
 * user's own style.
 */
export function pickBestHook(
  candidates: HookCandidate[],
  context: HookContext,
): { best: HookCandidate | null; score: number; passedChecks: boolean } {
  let best: { candidate: HookCandidate; score: number; hard: boolean } | null =
    null
  for (const candidate of candidates) {
    const { issues, hard } = checkHook(candidate.text, context)
    let score = (9 - gradeRank(candidate.grade)) * 3
    if (/\d/.test(candidate.text)) score += 2
    if (!issues.includes('notNamed')) score += 2
    if (CONTRAST.test(candidate.text)) score += 1
    if (candidate.source === 'format') score += 1.5
    if (hard) score -= 100
    if (!best || score > best.score) best = { candidate, score, hard }
  }
  return best
    ? { best: best.candidate, score: best.score, passedChecks: !best.hard }
    : { best: null, score: 0, passedChecks: false }
}

/** Latin brand like words in research titles that are not the product's own words. */
export function competitorBrandsFrom(args: {
  titles: string[]
  productName: string | null
  notes: string
  /** Facts already accepted for this product: words in them are the product's own. */
  supportText?: string
}): string[] {
  const own = new Set([
    ...tokens(args.productName ?? ''),
    ...tokens(args.notes),
    ...tokens(args.supportText ?? ''),
  ])
  const common = new Set([
    'review',
    'reviews',
    'price',
    'thailand',
    'shop',
    'shopee',
    'lazada',
    'official',
    'store',
    'online',
    'best',
    'with',
    'for',
    'and',
    'the',
    'buy',
    'sale',
    'new',
    'tiktok',
    'youtube',
    'facebook',
    'instagram',
    'pantip',
    'com',
    'www',
    'http',
    'https',
  ])
  const found = new Set<string>()
  for (const title of args.titles) {
    for (const word of title.match(/\b[A-Z][A-Za-z]{3,}\b/g) ?? []) {
      const lower = word.toLowerCase()
      if (!own.has(lower) && !common.has(lower)) found.add(word)
    }
  }
  return [...found]
}
