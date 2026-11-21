import type { Grade } from '@/services/hook-machine/rubric.js'
import type {
  HookSet,
  ProductBrief,
  ProfileInsights,
  ResearchDigest,
} from '@/services/hook-machine/schemas.js'
import type { Lang, Offer } from '@/services/live-script/checks.js'
import type {
  CUE_KINDS,
  CUE_PLACES,
  SEGMENT_PARTS,
} from '@/services/live-script/schemas.js'

export type JobStatus = 'running' | 'ready' | 'error'

/** Steps the seller sees while a show is being made. */
export const SHOW_STEPS = [
  { key: 'brief', label: 'อ่านรูปและโน้ต' },
  { key: 'research', label: 'ค้นข้อมูลสินค้า' },
  { key: 'hooks', label: 'คิดฮุกเปิดไลฟ์' },
  { key: 'pitch', label: 'เขียนบทแนะนำสินค้า' },
  { key: 'verify', label: 'ตรวจว่าทุกบรรทัดมีที่มา' },
] as const
export type ShowStep = (typeof SHOW_STEPS)[number]['key']
export const STEP_COUNT = SHOW_STEPS.length

export type SegmentVariant = {
  label: string
  seconds: number
  lines: { part: (typeof SEGMENT_PARTS)[number]; text: string }[]
}

/** What the writer and the checks work with. The API shows it as `plan`. */
export type RunOfShow = {
  rehooks: { atMinute: number; text: string; grade: Grade; note: string }[]
  engagement: { atMinute: number; text: string }[]
  segment: { targetSeconds: [number, number]; variants: SegmentVariant[] }
  objections: { question: string; answer: string; ifUnknown: string }[]
  transitions: { label: string; text: string }[]
  closing: string[]
  cues: {
    where: (typeof CUE_PLACES)[number]
    kind: (typeof CUE_KINDS)[number]
    note: string
  }[]
}

export type SegmentCue = (typeof CUE_KINDS)[number]

/** The playbook the seller drew from before going live. Context for suggestions, not a timeline. */
export type Playbook = {
  openingHooks: {
    text: string
    grade: Grade
    note: string
    source: 'style' | 'original'
  }[]
  /** Lines for people who join mid stream. */
  newcomerLines: { text: string; grade: Grade; note: string }[]
  pitches: SegmentVariant[]
  /** What the seller can lean on when picking a topic. */
  sellingPoints: string[]
  chatPrompts: string[]
  objections: RunOfShow['objections']
  transitions: RunOfShow['transitions']
  closing: string[]
  cues: RunOfShow['cues']
}

/** The stored document. */
export type LiveShowDoc = {
  id: string
  ownerId: string
  createdAt: string
  status: JobStatus
  step: string | null
  stepIndex: number
  error: string | null
  errorCode: string | null
  mock: boolean
  /** The playbook is written in Thai. Suggestions follow the language the seller speaks. */
  language: Lang
  profileId: string | null
  profileName: string | null
  /** A snapshot of the style used, so replies never need the profile again. */
  style: {
    name: string
    styleSummary: string
    voice: ProfileInsights['voice']
  } | null
  input: {
    notes: string
    productUrl: string | null
    offer: Offer
    imageCount: number
  }
  brief: ProductBrief | null
  research:
    | (ResearchDigest & {
        sources: { title: string; url: string }[]
        warnings: string[]
      })
    | null
  hooks: HookSet | null
  show: RunOfShow | null
  playbook: Playbook | null
  /** False when the AI source check could not run, so the lines were not reviewed for invented claims. */
  verified: boolean
  /** Lines the checks dropped or cleaned, and why. */
  warnings: string[]
}

/** What the API returns. */
export type Show = {
  id: string
  status: JobStatus
  step: string | null
  stepIndex: number
  stepCount: number
  error: string | null
  createdAt: string
  profileName: string | null
  product: { name: string; category: string } | null
  playbook: Playbook | null
  /** Extras that help the seller trust the result. */
  warnings: string[]
  verified: boolean
  mock: boolean
}

export type LiveReply = {
  text: string
  status: 'answered' | 'unknown' | 'declined'
  note: string | null
  /** What the answer stands on, shown as a small hint. */
  basis: string[]
}
