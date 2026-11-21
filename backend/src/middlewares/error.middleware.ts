import type { ErrorRequestHandler } from 'express'

import { isPrivateAgentPath } from '@/constants/agent.js'
import { createErrorKey, ERROR_CODES } from '@/constants/error-code.js'
import { normalizeError } from '@/services/error.service.js'
import { logger } from '@/services/logger.service.js'
import { pathWithoutQuery } from '@/utils/request-path.js'

const MAX_LOGGED_BODY_BYTES = 4096

function loggableBody(body: unknown): unknown {
  if (body === undefined || body === null) return body

  try {
    const size = Buffer.byteLength(JSON.stringify(body) ?? '')
    return size > MAX_LOGGED_BODY_BYTES ? { omitted: true, bytes: size } : body
  } catch {
    return { omitted: true, bytes: -1 }
  }
}

export const errorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  const fallbackKey = createErrorKey(
    'request',
    `${request.method}-${request.path}`,
  )
  const appError = normalizeError(error, fallbackKey)
  const definition = ERROR_CODES[appError.codeName]
  const requestId = String(response.locals.requestId ?? '')
  const path = pathWithoutQuery(request.originalUrl)

  const context = {
    requestId,
    method: request.method,
    path,
    code: definition.code,
    key: appError.key,
    params: request.params,
    query: request.query,
    ...(isPrivateAgentPath(path) ? {} : { body: loggableBody(request.body) }),
  }

  if (appError.status >= 500) {
    logger.error('REQUEST_ERROR', error, context)
  } else {
    logger.warn('REQUEST_REJECTED', context)
  }

  response.status(appError.status).json({
    success: false,
    message: appError.message,
    message_TH: appError.messageTH,
    code: definition.code,
    key: appError.key,
    requestId,
    ...(appError.details === undefined ? {} : { details: appError.details }),
  })
}
