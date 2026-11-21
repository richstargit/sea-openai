import {
  ACTIVITY_LOG_MAX_BODY_CHARS,
  ACTIVITY_LOG_MAX_ERROR_KEY_CHARS,
  ACTIVITY_LOG_MAX_PATH_CHARS,
  ACTIVITY_LOG_MAX_USER_AGENT_CHARS,
  ACTIVITY_LOG_SERVICE,
} from '@/constants/activity-log.js'
import { logger, redact } from '@/services/logger.service.js'

export type ActivityInput = {
  userId: string | null
  requestId: string
  method: string
  path: string
  statusCode: number
  durationMs: number
  requestBody: unknown
  responseBody: unknown
  ip: string | null
  userAgent: string | null
}

export function serializeBody(body: unknown): string | null {
  if (body === undefined || body === null) return null
  if (typeof body === 'object' && Object.keys(body).length === 0) return null

  const serialized = JSON.stringify(redact(body))
  if (serialized === undefined) return null
  if (serialized.length <= ACTIVITY_LOG_MAX_BODY_CHARS) return serialized

  return JSON.stringify({ truncated: true, characters: serialized.length })
}

export function errorKeyOf(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null

  const key = (body as { key?: unknown }).key
  if (typeof key !== 'string' || key.length === 0) return null

  return key.slice(0, ACTIVITY_LOG_MAX_ERROR_KEY_CHARS)
}

export async function recordActivity(input: ActivityInput): Promise<void> {
  if (process.env.ACTIVITY_LOG_ENABLED === 'false') return

  const row = {
    userId: input.userId,
    requestId: input.requestId,
    service: ACTIVITY_LOG_SERVICE,
    method: input.method,
    path: input.path.slice(0, ACTIVITY_LOG_MAX_PATH_CHARS),
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    requestBody: serializeBody(input.requestBody),
    responseBody: serializeBody(input.responseBody),
    errorKey: errorKeyOf(input.responseBody),
    ip: input.ip,
    userAgent:
      input.userAgent?.slice(0, ACTIVITY_LOG_MAX_USER_AGENT_CHARS) ?? null,
  }

  logger.info('ACTIVITY_LOG', row)
}
