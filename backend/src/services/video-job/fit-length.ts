// Makes the voice of a video job land on the length the user chose.
// 1. Check the spoken lines against a word budget and tighten them if they are over.
// 2. Speak them as one continuous text (no long breaths between lines).
// 3. Measure the take, shorten the long gaps, and change the speed a little if needed.
// 4. If it is still too long, tighten the text once more (at most two rounds), then
//    accept the closest result with a warning. The video is never failed for length alone.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  ACCEPT_MAX,
  ACCEPT_MIN,
  judgeFit,
  type LengthBudget,
  lengthBudget,
  tighterBudget,
  totalUnits,
} from '@/services/hook-machine/script-budget.js'
import {
  type TightenFn,
  tightenLines,
} from '@/services/hook-machine/script-fit.js'
import {
  applyFit,
  type FitResult,
  joinForSpeech,
} from '@/services/hook-machine/voice/fit.js'

const MAX_ROUNDS = 2
/** The speech endpoint refuses longer text. */
const MAX_INPUT_CHARS = 4096

export type FitSpeechArgs = {
  lines: string[]
  languageCode: string
  languageName: string
  targetSec: number
  productName: string | null
  /** A folder that exists or can be created; the raw and fitted takes are written here. */
  dir: string
  /** Turns the joined text into a wav. */
  synthesize: (input: string) => Promise<Buffer>
  tighten?: TightenFn
  fit?: (args: {
    inPath: string
    outPath: string
    targetSec: number
  }) => Promise<FitResult>
}

export type FitSpeechResult = {
  /** The lines that were actually spoken, which may be shorter than the ones given. */
  lines: string[]
  audioPath: string
  durationSec: number
  rounds: number
  tempo: number | null
  shortenedGaps: number
  inRange: boolean
  warnings: string[]
}

export const LENGTH_WARNING = {
  long: 'ความยาวคลิปมากกว่าที่เลือกเล็กน้อย',
  short: 'ความยาวคลิปน้อยกว่าที่เลือกเล็กน้อย',
} as const

/** Tightens the lines until the estimate is inside the budget, at most two passes. */
export async function tightenToBudget(args: {
  lines: string[]
  languageCode: string
  languageName: string
  budget: LengthBudget
  productName: string | null
  tighten: TightenFn
}): Promise<{ lines: string[]; passes: number }> {
  let lines = args.lines
  let passes = 0
  while (passes < MAX_ROUNDS) {
    const verdict = judgeFit(totalUnits(lines, args.languageCode), args.budget)
    if (verdict.status !== 'tighten') break
    const next = await args.tighten({
      lines,
      languageCode: args.languageCode,
      languageName: args.languageName,
      budget: args.budget,
      productName: args.productName,
    })
    passes += 1
    // A reply that is not shorter did not help; stop instead of looping on it.
    if (totalUnits(next, args.languageCode) >= totalUnits(lines, args.languageCode)) {
      break
    }
    lines = next
  }
  return { lines, passes }
}

export async function fitSpeech(args: FitSpeechArgs): Promise<FitSpeechResult> {
  const tighten = args.tighten ?? tightenLines
  const fit = args.fit ?? applyFit
  const warnings: string[] = []
  await mkdir(args.dir, { recursive: true })

  let budget = lengthBudget({
    targetSec: args.targetSec,
    language: args.languageCode,
  })

  // 1. The text first: cheaper than speaking it twice.
  let { lines } = await tightenToBudget({
    lines: args.lines,
    languageCode: args.languageCode,
    languageName: args.languageName,
    budget,
    productName: args.productName,
    tighten,
  })

  let best: {
    lines: string[]
    result: FitResult
    path: string
    distance: number
  } | null = null
  let rounds = 0

  for (let round = 0; round <= MAX_ROUNDS; round++) {
    rounds = round + 1
    let input = joinForSpeech(lines)
    if (input.length > MAX_INPUT_CHARS) {
      // Too long for the speech endpoint at all: force a tighter text.
      budget = tighterBudget(budget, args.targetSec * 2)
      lines = (
        await tightenToBudget({
          lines,
          languageCode: args.languageCode,
          languageName: args.languageName,
          budget,
          productName: args.productName,
          tighten,
        })
      ).lines
      input = joinForSpeech(lines)
    }

    const raw = path.join(args.dir, `voice-raw-${round}.wav`)
    const fitted = path.join(args.dir, `voice-fit-${round}.wav`)
    await writeFile(raw, await args.synthesize(input))
    const result = await fit({
      inPath: raw,
      outPath: fitted,
      targetSec: args.targetSec,
    })
    await rm(raw, { force: true })

    const distance = Math.abs(result.durationSec / args.targetSec - 1)
    if (!best || distance < best.distance) {
      if (best) await rm(best.path, { force: true })
      best = { lines, result, path: fitted, distance }
    } else {
      await rm(fitted, { force: true })
    }
    if (result.inRange) break

    const share = result.durationSec / args.targetSec
    // Too short is accepted: padding the text would add things nobody asked for.
    if (share < ACCEPT_MIN || round === MAX_ROUNDS) break

    // Still too long even after the gentlest speed up: write fewer words and try again.
    const beforeTempo = result.durationSec * (result.tempo ?? 1)
    budget = tighterBudget(budget, beforeTempo)
    const tightened = await tighten({
      lines,
      languageCode: args.languageCode,
      languageName: args.languageName,
      budget,
      productName: args.productName,
    })
    if (totalUnits(tightened, args.languageCode) >= totalUnits(lines, args.languageCode)) {
      break
    }
    lines = tightened
  }

  if (!best) throw new Error('no voice take was produced')

  const finalPath = path.join(args.dir, 'voice.wav')
  if (best.path !== finalPath) {
    const { rename } = await import('node:fs/promises')
    await rename(best.path, finalPath)
  }
  const share = best.result.durationSec / args.targetSec
  if (share > ACCEPT_MAX) warnings.push(LENGTH_WARNING.long)
  if (share < ACCEPT_MIN) warnings.push(LENGTH_WARNING.short)

  return {
    lines: best.lines,
    audioPath: finalPath,
    durationSec: best.result.durationSec,
    rounds,
    tempo: best.result.tempo,
    shortenedGaps: best.result.shortened,
    inRange: warnings.length === 0,
    warnings,
  }
}
