/** The six visible steps of one button video, in order. */
export const VIDEO_STEPS = [
  'brief',
  'research',
  'hooks',
  'script',
  'voice',
  'compose',
] as const
export type VideoStep = (typeof VIDEO_STEPS)[number]
export const STEP_COUNT = VIDEO_STEPS.length

export type VideoStatus = 'running' | 'ready' | 'error'

export const VIDEO_DURATIONS = [15, 30, 45, 60] as const

/** Voice languages the one button flow accepts (the catalog has the same codes). */
export const VOICE_LANGUAGES = [
  'en',
  'th',
  'ja',
  'zh',
  'es',
  'id',
  'vi',
] as const

/** What is stored per video job. `errorCode` and `trail` stay internal. */
export type VideoDoc = {
  id: string
  ownerId: string
  profileId: string
  /** The normal Hook Machine project that holds the script of this video. */
  projectId: string
  createdAt: string
  durationSec: number
  voiceLanguage: string
  voice: { model: string; voice: string; styleId: string }
  status: VideoStatus
  step: VideoStep | null
  stepIndex: number
  errorCode: string | null
  error: string | null
  file: { sizeBytes: number; durationSec: number } | null
  mock: boolean
  /** Steps entered so far, for tests and debugging. */
  trail: VideoStep[]
}

/** What the API returns. */
export type VideoJob = {
  id: string
  profileId: string
  status: VideoStatus
  step: VideoStep | null
  stepIndex: number
  stepCount: number
  error: string | null
  createdAt: string
  durationSec: number
  voiceLanguage: string
  file: { url: string; sizeBytes: number; durationSec: number } | null
}

export const videoFileUrl = (id: string) =>
  `/agent/hook-machine/videos/${id}/file`

export function toVideoJob(doc: VideoDoc): VideoJob {
  return {
    id: doc.id,
    profileId: doc.profileId,
    status: doc.status,
    step: doc.status === 'running' ? doc.step : null,
    stepIndex: doc.status === 'ready' ? STEP_COUNT : doc.stepIndex,
    stepCount: STEP_COUNT,
    error: doc.status === 'error' ? doc.error : null,
    createdAt: doc.createdAt,
    durationSec: doc.durationSec,
    voiceLanguage: doc.voiceLanguage,
    file:
      doc.status === 'ready' && doc.file
        ? {
            url: videoFileUrl(doc.id),
            sizeBytes: doc.file.sizeBytes,
            durationSec: doc.file.durationSec,
          }
        : null,
  }
}
