import type { ShowStep } from '@/services/live-script/types.js'

/** Stable internal codes. The seller only ever sees the Thai sentence. */
export const SHOW_ERRORS = {
  write_failed: 'เขียนบทพูดไม่สำเร็จ ลองสร้างใหม่อีกครั้ง',
  ai_busy: 'ตอนนี้ AI คิวเต็ม ลองใหม่ในอีกสักครู่',
  ai_unavailable: 'ตอนนี้ใช้ AI ไม่ได้ ลองใหม่ภายหลัง',
  timeout: 'ใช้เวลานานเกินไป ลองสร้างใหม่อีกครั้ง',
  restart: 'เซิร์ฟเวอร์ถูกรีสตาร์ทระหว่างทำงาน กดสร้างอีกครั้ง',
  unknown: 'สร้างบทพูดไม่สำเร็จ ลองใหม่อีกครั้ง',
} as const

export type ShowErrorCode = keyof typeof SHOW_ERRORS

export class ShowError extends Error {
  constructor(
    readonly code: ShowErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'ShowError'
  }
}

type ApiErrorLike = { status?: number; code?: string | null }

/**
 * Turns anything thrown into a stable code and a Thai sentence. Provider
 * errors, stack text and file paths never reach the seller.
 */
export function classifyError(
  error: unknown,
  _stage: ShowStep | null,
): { code: ShowErrorCode; messageTH: string } {
  let code: ShowErrorCode
  if (error instanceof ShowError) {
    code = error.code
  } else {
    const e = (error ?? {}) as ApiErrorLike
    if (e.status === 429 || e.code === 'insufficient_quota') code = 'ai_busy'
    else if (e.status === 401 || e.status === 403 || e.status === 404)
      code = 'ai_unavailable'
    else code = 'write_failed'
  }
  return { code, messageTH: SHOW_ERRORS[code] }
}
