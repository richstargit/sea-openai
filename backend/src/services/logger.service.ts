import { randomUUID } from 'node:crypto'

import chalk from 'chalk'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import type { Request, RequestHandler } from 'express'

import { isPrivateAgentPath } from '@/constants/agent.js'
import { pathWithoutQuery } from '@/utils/request-path.js'

dayjs.extend(utc)
dayjs.extend(timezone)

const hiddenKeys = new Set([
  'authorization',
  'cookie',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'apikey',
])

const hiddenExactKeys = new Set(['code', 'state'])
const hiddenKeyList = [...hiddenKeys]

function isHiddenKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, '')
  if (hiddenExactKeys.has(normalized)) return true
  return hiddenKeyList.some((hidden) => normalized.includes(hidden))
}

type LogContext = Record<string, unknown>
type LogLevel = 'LOG' | 'INFO' | 'HTTP' | 'WARN' | 'ERROR'

const levelColors: Record<LogLevel, (value: string) => string> = {
  LOG: chalk.magenta,
  INFO: chalk.green,
  HTTP: chalk.cyan,
  WARN: chalk.yellow,
  ERROR: chalk.red,
}

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (!value || typeof value !== 'object') return value
  if (seen.has(value)) return '[Circular]'

  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redact(item, seen))

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      isHiddenKey(key) ? '[REDACTED]' : redact(item, seen),
    ]),
  )
}

function errorDetails(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
    }
  }

  return { error: redact(error) }
}

export class LoggerService {
  log(...values: unknown[]): void {
    if (values.length === 0) {
      this.write('LOG', 'LOG', {})
      return
    }

    const [firstValue, ...remainingValues] = values
    const event = typeof firstValue === 'string' ? firstValue : 'LOG'
    const data =
      typeof firstValue === 'string'
        ? remainingValues
        : [firstValue, ...remainingValues]

    this.write(
      'LOG',
      event,
      data.length > 0 ? { data: data.length === 1 ? data[0] : data } : {},
    )
  }

  info(event: string, context: LogContext = {}): void {
    this.write('INFO', event, context)
  }

  warn(event: string, context: LogContext = {}): void {
    this.write('WARN', event, context)
  }

  http(event: string, context: LogContext = {}): void {
    this.write('HTTP', event, context)
  }

  error(event: string, error: unknown, context: LogContext = {}): void {
    this.write('ERROR', event, { ...context, ...errorDetails(error) })
  }

  requestMiddleware(): RequestHandler {
    return (request, response, next) => {
      const requestId = this.resolveRequestId(request)
      const path = pathWithoutQuery(request.originalUrl || request.url)

      response.locals.requestId = requestId
      response.setHeader('X-Request-Id', requestId)

      if (process.env.NODE_ENV !== 'test') {
        this.info('INBOUND', {
          requestId,
          method: request.method,
          path,
          query: request.query,
          params: request.params,
          ...(isPrivateAgentPath(path) ? {} : { body: request.body }),
        })
      }

      next()
    }
  }

  private resolveRequestId(request: Request): string {
    const providedRequestId = request.header('x-request-id')?.trim()
    return providedRequestId && providedRequestId.length <= 128
      ? providedRequestId
      : randomUUID()
  }

  private write(level: LogLevel, event: string, context: LogContext): void {
    if (process.env.NODE_ENV === 'test' || process.env.LOG_LEVEL === 'silent') {
      return
    }

    const safeContext = redact(context) as LogContext
    const timestamp = dayjs()
      .tz(process.env.LOG_TIMEZONE || 'Asia/Bangkok')
      .format('YYYY-MM-DD HH:mm:ss.SSS Z')
    const entry = {
      timestamp,
      level,
      event,
      ...safeContext,
    }
    const output =
      process.env.NODE_ENV === 'production'
        ? JSON.stringify(entry)
        : this.prettyOutput(timestamp, level, event, safeContext)

    if (level === 'ERROR') {
      console.error(output)
      return
    }

    if (level === 'WARN') {
      console.warn(output)
      return
    }

    if (level === 'LOG') {
      console.log(output)
      return
    }

    console.info(output)
  }

  private prettyOutput(
    timestamp: string,
    level: LogLevel,
    event: string,
    context: LogContext,
  ): string {
    const contextText =
      Object.keys(context).length > 0
        ? ` ${chalk.dim(JSON.stringify(context))}`
        : ''

    return `${chalk.gray(timestamp)} ${levelColors[level](level.padEnd(5))} ${chalk.bold(event)}${contextText}`
  }
}

export const logger = new LoggerService()
