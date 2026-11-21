// Model backed steps of the length fit: shorten spoken lines to a budget, and
// the budget wording for the translation step. The counting and the decisions
// live in script-budget.ts and stay pure.

import { z } from 'zod'

import { aiIsMocked, structured } from '@/services/hook-machine/ai.js'
import {
  type LengthBudget,
  spokenUnits,
  totalUnits,
} from '@/services/hook-machine/script-budget.js'
import { cleanDisplayText } from '@/services/hook-machine/rubric.js'

const tightenSchema = z.object({ lines: z.array(z.string()) })

export type TightenArgs = {
  lines: string[]
  languageCode: string
  languageName: string
  budget: LengthBudget
  productName: string | null
}

export type TightenFn = (args: TightenArgs) => Promise<string[]>

/**
 * Shortens the lines until they say at most the budget. The model keeps the
 * hook and the call to action, drops or merges the weakest middle lines, and
 * never adds anything. A reply that is not shorter is ignored by the caller.
 */
export const tightenLines: TightenFn = async (args) => {
  // Demo mode has no model; the lines are returned as they are.
  if (aiIsMocked()) return args.lines
  const unit = args.budget.unit === 'chars' ? 'characters, spaces not counted' : 'words'
  const result = await structured({
    name: 'script_tighten',
    schema: tightenSchema,
    maxOutputTokens: 2000,
    instructions: `You shorten the spoken lines of a short video so they fit a time budget. Language: ${args.languageName}.
- The lines together may have at most ${args.budget.totalUnits} ${unit}. The hook line at most ${args.budget.hookUnits} and the last line at most ${args.budget.closingUnits}. Count each line before you answer.
- Keep the first line (the hook) and the last line (the call to action), shortened if needed. Drop or merge the weakest middle lines first. Keep what makes a viewer want the product.
- Never add a fact, a number, a price, a brand, a benefit or a claim that is not already in the lines. Never name another brand.
- Keep the voice and the wording of the lines you keep. No quotation marks, no dash characters, no emoji, no full stops inside a sentence. Write numbers the way they are spoken.
- Return the lines in order. Fewer lines than the input is fine.`,
    input: JSON.stringify({
      productName: args.productName,
      lines: args.lines.map((text) => ({
        text,
        units: spokenUnits(text, args.languageCode),
      })),
      totalUnitsNow: totalUnits(args.lines, args.languageCode),
    }),
  })
  const cleaned = result.lines.map((line) => cleanDisplayText(line)).filter(Boolean)
  return cleaned.length > 0 ? cleaned : args.lines
}

/** Extra wording for the translation prompt: translate to fit, not word for word. */
export function translationBudgetPrompt(args: {
  sourceLines: string[]
  sourceCode: string
  budget: LengthBudget
  languageName: string
}): string {
  const unit = args.budget.unit === 'chars' ? 'characters (spaces not counted)' : 'words'
  const weights = args.sourceLines.map((line) =>
    Math.max(1, spokenUnits(line, args.sourceCode)),
  )
  const sum = weights.reduce((a, b) => a + b, 0)
  const perLine = weights.map((w) =>
    Math.max(2, Math.floor((args.budget.totalUnits * w) / sum)),
  )
  return `LENGTH BUDGET (hard limit): the finished video has a fixed length, so the translation must be as short as the original takes to say. All ${args.languageName} lines together may have at most ${args.budget.totalUnits} ${unit}. Per line limits, in order: ${perLine.join(', ')}. Translate to fit, not word for word: keep the meaning and the persuasion, drop filler and repeated detail, and never add a fact. Count before you answer and shorten if you are over.`
}
