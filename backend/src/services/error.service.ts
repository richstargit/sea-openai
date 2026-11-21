import { ZodError } from 'zod'

import { ERROR_CODES, type ErrorCodeName } from '@/constants/error-code.js'

type AppErrorOptions = {
  key: string
  message?: string
  messageTH?: string
  cause?: unknown
  details?: unknown
}

export class AppError extends Error {
  readonly codeName: ErrorCodeName
  readonly key: string
  readonly messageTH: string
  readonly status: number
  readonly details?: unknown

  constructor(codeName: ErrorCodeName, options: AppErrorOptions) {
    const definition = ERROR_CODES[codeName]
    super(options.message ?? definition.message, { cause: options.cause })

    this.name = 'AppError'
    this.codeName = codeName
    this.key = options.key
    this.messageTH = options.messageTH ?? definition.messageTH
    this.status = definition.status
    this.details = options.details
  }
}

export function normalizeError(error: unknown, fallbackKey: string): AppError {
  if (error instanceof AppError) return error

  if (error instanceof ZodError) {
    return new AppError('VALIDATION_ERROR', {
      key: fallbackKey,
      cause: error,
      details: error.flatten(),
    })
  }

  if (isServiceUnavailable(error)) {
    return new AppError('SERVICE_UNAVAILABLE', {
      key: fallbackKey,
      cause: error,
    })
  }

  return new AppError('INTERNAL_SERVER_ERROR', {
    key: fallbackKey,
    cause: error,
  })
}

function isServiceUnavailable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const value = error as { code?: string; name?: string }
  return [
    'DB_POOL_TIMEOUT',
    'POOL_ENQUEUELIMIT',
    'ECONNREFUSED',
    'PROTOCOL_CONNECTION_LOST',
    'ETIMEDOUT',
  ].includes(value.code ?? value.name ?? '')
}
