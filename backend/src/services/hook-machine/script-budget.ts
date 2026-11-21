// How much a spoken script may say so the finished clip lands on the length the
// user chose. Pure functions only: nothing here calls a model or touches a file.

import { languageInfo } from '@/services/hook-machine/voice/catalog.js'
import { speechUnits } from '@/services/hook-machine/voice/scoring.js'

/**
 * Spoken units per second of FINISHED audio (gaps between phrases included,
 * after the long gaps are shortened). Measured on gpt-4o-mini-tts with the
 * marin voice and the creator style, on eight real finished takes (4 lengths in
 * each language): Thai 9.7 to 11.0 characters per second (mean 10.1), English
 * 3.6 to 4.0 words per second (mean 3.8). The other languages are estimates
 * from the comfortable speaking band, so the measured fit step corrects them
 * after the first take.
 */
const MEASURED_RATE: Record<string, number> = { th: 10.1, en: 3.8 }

export function ratePerSecond(languageCode: string): number {
  const measured = MEASURED_RATE[languageCode]
  if (measured) return measured
  const info = languageInfo(languageCode)
  if (!info) return MEASURED_RATE.en ?? 3.4
  return Math.round(((info.band[0] + info.band[1]) / 2) * 1.1 * 100) / 100
}

/**
 * The same content takes different spoken time in different languages: the
 * same sales pitch is about 3.5 Thai characters per English word, and the
 * English version takes roughly 70 percent of the speaking time of the Thai
 * one (measured: 293 Thai characters became 81 English words, 29 s against 20 s).
 * So a script written in one language has to be sized for the language that
 * will be spoken. Other pairs are assumed to take the same time.
 */
const THAI_CHARS_PER_ENGLISH_WORD = 3.5

/** How many units of `from` carry the same content as one unit of `to`. */
export function contentFactor(from: string, to: string): number {
  if (from === to) return 1
  if (from === 'th' && to === 'en') return THAI_CHARS_PER_ENGLISH_WORD
  if (from === 'en' && to === 'th') return 1 / THAI_CHARS_PER_ENGLISH_WORD
  // Same speaking time: convert through seconds.
  return ratePerSecond(from) / ratePerSecond(to)
}

/** A digit run is spoken as several syllables, which a plain count misses. */
function digitExtra(text: string, unit: 'words' | 'chars'): number {
  const runs = text.match(/\d+(?:[.,]\d+)?/g) ?? []
  let extra = 0
  for (const run of runs) {
    const digits = run.replace(/\D/g, '').length
    // Thai says each number in about 4 to 8 characters of text, English in 1 or 2 words.
    extra += unit === 'chars' ? 2 + digits * 1.5 : 0.5 + digits * 0.25
  }
  return extra
}

/** Words or characters as they are SPOKEN (digits counted as the words they become). */
export function spokenUnits(text: string, languageCode: string): number {
  const info = languageInfo(languageCode)
  if (!info) return text.split(/\s+/).filter(Boolean).length
  return speechUnits(text, info) + digitExtra(text, info.unit)
}

export const totalUnits = (lines: string[], languageCode: string): number =>
  lines.reduce((sum, line) => sum + spokenUnits(line, languageCode), 0)

export const estimateSeconds = (units: number, languageCode: string): number =>
  units / ratePerSecond(languageCode)

/** Aim a little under the target so a slow take still lands inside the accepted range. */
export const AIM = 0.97
/** The finished clip must land between these shares of the chosen length. */
export const ACCEPT_MIN = 0.85
export const ACCEPT_MAX = 1.07
/** Extra length that triggers a tighten pass on the text. */
export const OVER_TOLERANCE = 0.08
/** Text shorter than this much under the budget is accepted as it is. */
export const UNDER_TOLERANCE = 0.25

export type LengthBudget = {
  targetSec: number
  language: string
  unit: 'words' | 'chars'
  /** Units per second used for this language. */
  rate: number
  /** The most the whole spoken script may say. */
  totalUnits: number
  hookUnits: number
  closingUnits: number
  /** What each of the middle beats may say. */
  bodyBeatUnits: number
  bodyBeats: number
  beats: number
}

/** About one beat every 6 seconds, never fewer than 3 or more than 10. */
export function suggestedBeatCount(targetSec: number): number {
  return Math.max(3, Math.min(10, Math.round(targetSec / 6)))
}

export function lengthBudget(args: {
  targetSec: number
  /** The language the text is written in. */
  language: string
  /** The language that will be spoken, when it is not the one the text is written in. */
  spokenLanguage?: string
}): LengthBudget {
  const spoken = args.spokenLanguage ?? args.language
  const info = languageInfo(args.language)
  const unit = info?.unit ?? 'words'
  // The budget is worked out in the spoken language, then sized in the written one.
  const scale = contentFactor(args.language, spoken)
  const rate = ratePerSecond(spoken) * scale
  const aimSec = args.targetSec * AIM
  const total = Math.max(4, Math.round(rate * aimSec))
  const beats = suggestedBeatCount(args.targetSec)
  // The hook gets about 3 seconds and the closing about 4, the rest is shared.
  const hookSec = Math.min(3, aimSec * 0.25)
  const closingSec = Math.min(4, aimSec * 0.25)
  const hookUnits = Math.max(2, Math.round(rate * hookSec))
  const closingUnits = Math.max(2, Math.round(rate * closingSec))
  const bodyBeats = Math.max(1, beats - 2)
  const bodyBeatUnits = Math.max(
    2,
    Math.floor((total - hookUnits - closingUnits) / bodyBeats),
  )
  return {
    targetSec: args.targetSec,
    language: args.language,
    unit,
    rate,
    totalUnits: total,
    hookUnits,
    closingUnits,
    bodyBeatUnits,
    bodyBeats,
    beats,
  }
}

export type FitVerdict = {
  status: 'ok' | 'tighten' | 'short'
  units: number
  /** units divided by the budget. */
  ratio: number
}

export function judgeFit(units: number, budget: LengthBudget): FitVerdict {
  const ratio = budget.totalUnits > 0 ? units / budget.totalUnits : 1
  if (ratio > 1 + OVER_TOLERANCE) return { status: 'tighten', units, ratio }
  if (ratio < 1 - UNDER_TOLERANCE) return { status: 'short', units, ratio }
  return { status: 'ok', units, ratio }
}

/** The budget for a tighten pass after the audio ran long: scaled by how far off it was. */
export function tighterBudget(
  budget: LengthBudget,
  actualSec: number,
): LengthBudget {
  if (actualSec <= 0) return budget
  const scale = Math.max(0.5, Math.min(1, (budget.targetSec * AIM) / actualSec))
  const total = Math.max(4, Math.floor(budget.totalUnits * scale))
  return {
    ...budget,
    totalUnits: total,
    hookUnits: Math.max(2, Math.floor(budget.hookUnits * scale)),
    closingUnits: Math.max(2, Math.floor(budget.closingUnits * scale)),
    bodyBeatUnits: Math.max(2, Math.floor(budget.bodyBeatUnits * scale)),
  }
}

/** The part of a prompt that tells the writer how much it may say. */
export function budgetPrompt(
  budget: LengthBudget,
  languageName: string,
): string {
  const unit =
    budget.unit === 'chars' ? 'characters (spaces not counted)' : 'words'
  return `LENGTH BUDGET (hard limit, the video must end on time):
- The finished video is ${budget.targetSec} seconds. All spoken ${languageName} lines together may have at most ${budget.totalUnits} ${unit}, and should use at least ${Math.round(budget.totalUnits * 0.9)}: a script far under the budget leaves the video short. Aim for ${Math.round(budget.totalUnits * 0.95)}. Count before you answer, cut if you are over and add a supported benefit beat if you are well under.
- Use about ${budget.beats} beats. The hook beat at most ${budget.hookUnits} ${unit}, the closing call to action beat at most ${budget.closingUnits} ${unit}, and each beat in between at most ${budget.bodyBeatUnits} ${unit}.
- Write numbers and prices as they are spoken, for example thirty milliliters, not 30 ml. Spoken numbers take time.
- Fewer words is fine, padding is not. Make the beats startSec and endSec add up to ${budget.targetSec}.`
}
