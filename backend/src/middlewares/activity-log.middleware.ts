import type { RequestHandler, Response } from 'express'

import {
  ACTIVITY_LOG_METHODS,
  ACTIVITY_LOG_SKIPPED_PATHS,
} from '@/constants/activity-log.js'
import { isPrivateAgentPath } from '@/constants/agent.js'
import { recordActivity } from '@/services/activity-log.service.js'
import { logger } from '@/services/logger.service.js'
import { pathWithoutQuery } from '@/utils/request-path.js'

const NANOSECONDS_PER_MILLISECOND = 1_000_000n

export const activityLogger: RequestHandler = (request, response, next) => {
  const path = pathWithoutQuery(request.originalUrl || request.url)

  if (
    process.env.NODE_ENV === 'test' ||
    !ACTIVITY_LOG_METHODS.has(request.method) ||
    ACTIVITY_LOG_SKIPPED_PATHS.has(path)
  ) {
    next()
    return
  }

  const startedAt = process.hrtime.bigint()
  const logBodies = !isPrivateAgentPath(path)
  const sendJson = response.json.bind(response)
  let payload: unknown

  response.json = function capture(this: Response, body: unknown) {
    payload = body
    return sendJson(body)
  }

  response.on('finish', () => {
    void recordActivity({
      userId: response.locals.user?.id ?? null,
      requestId: String(response.locals.requestId ?? ''),
      method: request.method,
      path,
      statusCode: response.statusCode,
      durationMs: Number(
        (process.hrtime.bigint() - startedAt) / NANOSECONDS_PER_MILLISECOND,
      ),
      requestBody: logBodies ? request.body : undefined,
      responseBody: logBodies ? payload : undefined,
      ip: request.ip ?? null,
      userAgent: request.get('user-agent') ?? null,
    }).catch((error) => {
      logger.error('ACTIVITY_LOG_HOOK_FAILED', error, { path })
    })
  })

  next()
}
