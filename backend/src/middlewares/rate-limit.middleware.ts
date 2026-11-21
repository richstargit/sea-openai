import type { RequestHandler } from 'express'
import rateLimit from 'express-rate-limit'

import { createErrorKey } from '@/constants/error-code.js'
import { AppError } from '@/services/error.service.js'

const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_LIMIT = 300

function positiveInteger(
  raw: string | undefined,
  fallback: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') return fallback

  const value = raw.trim()
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer, received "${raw}"`)
  }

  return Number(value)
}

export function createRateLimiter(
  limit = positiveInteger(process.env.RATE_LIMIT, DEFAULT_LIMIT, 'RATE_LIMIT'),
  windowMs = positiveInteger(
    process.env.RATE_LIMIT_WINDOW_MS,
    DEFAULT_WINDOW_MS,
    'RATE_LIMIT_WINDOW_MS',
  ),
): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_request, _response, next) => {
      next(
        new AppError('TOO_MANY_REQUESTS', {
          key: createErrorKey('service', 'rate-limit'),
        }),
      )
    },
  })
}

export const apiRateLimiter = createRateLimiter()
