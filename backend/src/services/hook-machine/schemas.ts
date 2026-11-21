import { z } from 'zod'

import { GRADES } from '@/services/hook-machine/rubric.js'

// OpenAI strict structured outputs: every field required, "maybe" is nullable.
const grade = z.enum(GRADES)
const pattern = z.object({
  name: z.string(),
  description: z.string(),
  evidence: z.string(),
})

export const videoAnalysisSchema = z.object({
  hookText: z.string(),
  hookLabel: z.string(),
  formula: z.string(),
  psychology: z.array(z.string()),
  triggerWords: z.array(z.string()),
  structureNotes: z.string(),
  visualHook: z.string(),
  bodyBeats: z.array(
    z.object({ name: z.string(), summary: z.string(), approxSec: z.number() }),
  ),
  cta: z.string().nullable(),
  tone: z.string(),
  whyItWorks: z.string(),
})
export type VideoAnalysis = z.infer<typeof videoAnalysisSchema>

export const profileInsightsSchema = z.object({
  styleSummary: z.string(),
  voice: z.object({
    tone: z.string(),
    persona: z.string(),
    sentenceStyle: z.string(),
    vocabulary: z.array(z.string()),
    avoid: z.array(z.string()),
  }),
  hookFormats: z.array(
    z.object({
      label: z.string(),
      original: z.string(),
      formula: z.string(),
      sourceIndex: z.number(),
      whyItWorks: z.string(),
    }),
  ),
  patterns: z.object({
    psychology: z.array(pattern),
    triggerWords: z.array(pattern),
    grammar: z.array(pattern),
    pacingAndVisual: z.array(pattern),
  }),
  structureTemplate: z.array(
    z.object({ name: z.string(), purpose: z.string(), typicalSec: z.number() }),
  ),
  ctaPatterns: z.array(z.string()),
  customPrinciples: z.array(pattern),
})
export type ProfileInsights = z.infer<typeof profileInsightsSchema>

export const productBriefSchema = z.object({
  productName: z.string(),
  category: z.string(),
  audience: z.string(),
  keywords: z.array(z.string()),
  searchQueries: z.array(z.string()),
  visibleFacts: z.array(z.string()),
})
export type ProductBrief = z.infer<typeof productBriefSchema>

export const researchDigestSchema = z.object({
  facts: z.array(
    z.object({
      claim: z.string(),
      source: z.enum(['user', 'image', 'web']),
      sourceUrl: z.string().nullable(),
    }),
  ),
  sellingPoints: z.array(z.string()),
  painPoints: z.array(z.string()),
  objections: z.array(z.string()),
  claimsToVerify: z.array(z.string()),
})
export type ResearchDigest = z.infer<typeof researchDigestSchema>

export const hookSetSchema = z.object({
  formatMatched: z.array(
    z.object({
      formatLabel: z.string(),
      text: z.string(),
      grade,
      note: z.string(),
    }),
  ),
  skippedFormats: z.array(
    z.object({ formatLabel: z.string(), reason: z.string() }),
  ),
  original: z.array(z.object({ text: z.string(), grade, note: z.string() })),
})
export type HookSet = z.infer<typeof hookSetSchema>

export const SECTIONS = [
  'hook',
  'problem',
  'solution',
  'demo',
  'proof',
  'cta',
] as const

export const scriptSchema = z.object({
  title: z.string(),
  totalSec: z.number(),
  beats: z.array(
    z.object({
      section: z.enum(SECTIONS),
      startSec: z.number(),
      endSec: z.number(),
      voiceover: z.string(),
      imageIndex: z.number().nullable(),
    }),
  ),
  caption: z.string(),
  hashtags: z.array(z.string()),
})
export type Script = z.infer<typeof scriptSchema>

export const hookReviewSchema = z.object({
  lines: z.array(z.object({ line: z.string(), grade, comment: z.string() })),
  overall: grade,
  summary: z.string(),
  rewrites: z.array(
    z.object({ text: z.string(), grade, whyStronger: z.string() }),
  ),
})
export type HookReview = z.infer<typeof hookReviewSchema>

export const voiceTranslationSchema = z.object({ lines: z.array(z.string()) })
export type VoiceTranslation = z.infer<typeof voiceTranslationSchema>
