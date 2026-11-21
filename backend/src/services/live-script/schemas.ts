import { z } from 'zod'

import { GRADES } from '@/services/hook-machine/rubric.js'

const grade = z.enum(GRADES)

/* ------------------------------------------------------------ request parts */

export const offerSchema = z.object({
  price: z.string().trim().max(80).default(''),
  promotion: z.string().trim().max(300).default(''),
  stock: z.string().trim().max(120).default(''),
  endsAt: z.string().trim().max(120).default(''),
})
export type OfferBody = z.infer<typeof offerSchema>

export const MAX_COMMENT_CHARS = 500
export const MAX_UTTERANCE_CHARS = 1000

export const sessionBody = z.object({
  /** Also send the suggested lines to the program overlay as a caption. Off by default. */
  showOnStream: z.boolean().default(false),
})

export const utteranceBody = z.object({
  text: z.string().trim().min(1).max(MAX_UTTERANCE_CHARS),
  final: z.boolean(),
  /** Milliseconds from the start of the session, as measured by the browser. */
  tsMs: z.number().finite().min(0).max(1e12),
})

export const replyBody = z.object({
  comment: z.string().trim().min(1).max(MAX_COMMENT_CHARS),
})

/* --------------------------------------------------------------- model output */

export const SEGMENT_PARTS = [
  'hook',
  'problem',
  'demo',
  'proof',
  'offer',
  'cta',
] as const

export const CUE_PLACES = [
  'opening',
  'rehook',
  'segment_offer',
  'segment_cta',
  'closing',
] as const

// Names follow the existing price overlay event types. These are data only.
export const CUE_KINDS = ['price', 'promo', 'gift', 'flash', 'product'] as const

export const liveShowSchema = z.object({
  rehooks: z.array(z.object({ text: z.string(), grade, note: z.string() })),
  engagement: z.array(z.string()),
  segment: z.object({
    variants: z.array(
      z.object({
        label: z.string(),
        lines: z.array(
          z.object({ part: z.enum(SEGMENT_PARTS), text: z.string() }),
        ),
      }),
    ),
  }),
  objections: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
      ifUnknown: z.string(),
    }),
  ),
  transitions: z.array(z.object({ label: z.string(), text: z.string() })),
  closing: z.array(z.string()),
  cues: z.array(
    z.object({
      where: z.enum(CUE_PLACES),
      kind: z.enum(CUE_KINDS),
      note: z.string(),
    }),
  ),
})
export type LiveShowRaw = z.infer<typeof liveShowSchema>

export const liveReplySchema = z.object({
  reply: z.string(),
  status: z.enum(['answered', 'unknown', 'declined']),
  basis: z.array(z.string()),
  sellerNote: z.string().nullable(),
})
export type LiveReplyRaw = z.infer<typeof liveReplySchema>

export const verifySchema = z.object({
  unsupported: z.array(z.object({ id: z.string(), reason: z.string() })),
})
export type Verdict = z.infer<typeof verifySchema>
