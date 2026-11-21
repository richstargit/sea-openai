import type { VideoStep } from '@/services/video-job/types.js'

/** Stable internal codes. The user only ever sees the Thai sentence. */
export const VIDEO_ERRORS = {
  script_failed: 'เขียนสคริปต์ไม่สำเร็จ ลองสร้างใหม่อีกครั้ง',
  script_too_long: 'สคริปต์ยาวเกินกว่าจะอ่านเป็นคลิปเดียว ลองเลือกความยาวที่สั้นลง',
  voice_failed: 'สร้างเสียงไม่สำเร็จ ลองสร้างใหม่อีกครั้ง',
  compose_failed: 'ประกอบวิดีโอไม่สำเร็จ ลองสร้างใหม่อีกครั้ง',
  ai_busy: 'ตอนนี้ AI คิวเต็ม ลองใหม่ในอีกสักครู่',
  ai_unavailable: 'ตอนนี้ใช้ AI ไม่ได้ ลองใหม่ภายหลัง',
  timeout: 'ใช้เวลานานเกินไป ลองสร้างใหม่อีกครั้ง',
  restart: 'เซิร์ฟเวอร์ถูกรีสตาร์ทระหว่างทำงาน กดสร้างอีกครั้ง',
  unknown: 'สร้างวิดีโอไม่สำเร็จ ลองใหม่อีกครั้ง',
} as const

export type VideoErrorCode = keyof typeof VIDEO_ERRORS

export class VideoJobError extends Error {
  constructor(
    readonly code: VideoErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'VideoJobError'
  }
}

type ApiErrorLike = { status?: number; code?: string | null }

const STAGE_CODE: Record<VideoStep, VideoErrorCode> = {
  brief: 'script_failed',
  research: 'script_failed',
  hooks: 'script_failed',
  script: 'script_failed',
  voice: 'voice_failed',
  compose: 'compose_failed',
}

/**
 * Turns anything thrown into a stable code and a Thai sentence. Provider
 * errors, stack text and file paths never reach the user.
 */
export function classifyError(
  error: unknown,
  stage: VideoStep | null,
): { code: VideoErrorCode; messageTH: string } {
  let code: VideoErrorCode
  if (error instanceof VideoJobError) {
    code = error.code
  } else {
    const e = (error ?? {}) as ApiErrorLike
    if (e.status === 429 || e.code === 'insufficient_quota') code = 'ai_busy'
    else if (e.status === 401 || e.status === 403 || e.status === 404)
      code = 'ai_unavailable'
    else code = stage ? STAGE_CODE[stage] : 'unknown'
  }
  return { code, messageTH: VIDEO_ERRORS[code] }
}
