import type { Pacing } from '@/services/hook-machine/collectors/media.js'
import type { Principle } from '@/services/hook-machine/rubric.js'
import type {
  HookReview,
  HookSet,
  ProductBrief,
  ProfileInsights,
  ResearchDigest,
  Script,
  VideoAnalysis,
} from '@/services/hook-machine/schemas.js'
import type { Platform } from '@/services/hook-machine/url.js'
import type { VoiceScores } from '@/services/hook-machine/voice/score-take.js'

export type Language = 'th' | 'en'
export type JobStatus = 'draft' | 'running' | 'ready' | 'error'
export type SourceStatus = 'pending' | 'running' | 'done' | 'error'

export type Source = {
  id: string
  url: string
  platform: Platform
  status: SourceStatus
  step: string | null
  error: string | null
  warnings: string[]
  via: string[]
  video: {
    title: string | null
    author: string | null
    publishedAt: string | null
    durationSec: number | null
    views: number | null
    likes: number | null
  } | null
  transcript: string | null
  transcriptSource: 'captions' | 'whisper' | 'none' | null
  pacing: Pacing | null
  analysis: VideoAnalysis | null
}

export type Profile = {
  id: string
  name: string
  language: Language
  createdAt: string
  status: JobStatus
  step: string | null
  error: string | null
  mock: boolean
  sources: Source[]
  insights:
    | (Omit<ProfileInsights, 'hookFormats'> & {
        // Format library with each entry pointing at the source it came from.
        hookFormats: (ProfileInsights['hookFormats'][number] & {
          sourceId: string | null
        })[]
      })
    | null
  rubric: Principle[]
}

export type ResearchSource = { title: string; url: string }

export type VoiceTake = {
  id: string
  styleId: string
  styleName: string
  status: 'pending' | 'running' | 'done' | 'error'
  error: string | null
  durationSec: number | null
  transcript: string | null
  scores: VoiceScores | null
  userRating: number | null
  recommended: boolean
}

export type VoiceState = {
  status: JobStatus
  step: string | null
  error: string | null
  mock: boolean
  settings: {
    language: string
    model: string
    voice: string
    styleIds: string[]
  }
  /** Exactly what was sent to the speech model. */
  spokenText: string | null
  /** Translated script per language code, so repeat runs cost nothing. */
  translations: Record<string, string[]>
  takes: VoiceTake[]
  createdAt: string
}

export type Project = {
  id: string
  profileId: string
  title: string
  createdAt: string
  status: JobStatus
  step: string | null
  error: string | null
  mock: boolean
  language: Language
  input: {
    notes: string
    productUrl: string | null
    durationSec: number
    images: string[]
  }
  brief: ProductBrief | null
  research:
    | (ResearchDigest & { sources: ResearchSource[]; warnings: string[] })
    | null
  hooks: HookSet | null
  chosenHook: string | null
  script: Script | null
  review: { input: string; result: HookReview } | null
  /** Absent on projects created before the voice feature. */
  voice?: VoiceState
}
