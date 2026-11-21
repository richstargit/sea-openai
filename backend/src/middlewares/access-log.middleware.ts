import type { Request, Response } from 'express'
import morgan, { type TokenIndexer } from 'morgan'

import { logger } from '@/services/logger.service.js'
import { pathWithoutQuery } from '@/utils/request-path.js'

export function accessFormat(
  tokens: TokenIndexer<Request, Response>,
  request: Request,
  response: Response,
): string {
  const requestId = response.getHeader('x-request-id')
  return JSON.stringify({
    method: request.method,
    path: pathWithoutQuery(request.originalUrl || request.url),
    statusCode: Number(
      tokens.status?.(request, response) ?? response.statusCode,
    ),
    durationMs: Math.round(
      Number(tokens['response-time']?.(request, response) ?? 0),
    ),
    requestId: requestId ? String(requestId) : null,
  })
}

export function writeAccess(message: string): void {
  try {
    const line = JSON.parse(message) as {
      method: string
      path: string
      statusCode: number
      durationMs: number
    }
    logger.http('HTTP_ACCESS', {
      ...line,
      message: `${line.method} ${line.path} ${line.statusCode} ${line.durationMs}ms`,
    })
  } catch {
    logger.http('HTTP_ACCESS', { message: message.trim() })
  }
}

export const accessLogger = morgan<Request, Response>(accessFormat, {
  skip: () => process.env.NODE_ENV === 'test',
  stream: { write: writeAccess },
})
