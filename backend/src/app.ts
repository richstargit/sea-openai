import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import responseTime from 'response-time'

import corsOptions from '@/config/cors.config.js'
import { serviceSpec } from '@/docs/service-spec.js'
import { accessLogger } from '@/middlewares/access-log.middleware.js'
import { activityLogger } from '@/middlewares/activity-log.middleware.js'
import { developmentErrorHandler } from '@/middlewares/development-error.middleware.js'
import { errorHandler } from '@/middlewares/error.middleware.js'
import { requestLogger } from '@/middlewares/logger.middleware.js'
import { notFoundHandler } from '@/middlewares/not-found.middleware.js'
import routes from '@/routes/index.js'

const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal'])

function isValidTrustProxyAddress(candidate: string): boolean {
  if (TRUST_PROXY_KEYWORDS.has(candidate)) return true
  if (/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(candidate)) return true
  return (
    candidate.includes(':') && /^[0-9a-fA-F:]+(\/\d{1,3})?$/.test(candidate)
  )
}

export function parseTrustProxy(
  raw: string | undefined,
): boolean | number | string[] | undefined {
  if (raw === undefined) return undefined

  const value = raw.trim()
  if (value === '') return undefined

  if (value === 'true') {
    throw new Error(
      'TRUST_PROXY=true is rejected because it lets clients spoof X-Forwarded-For; use a trusted hop count such as TRUST_PROXY=1 instead',
    )
  }

  if (value === 'false') return false
  if (/^\d+$/.test(value)) return Number(value)

  const addresses = value.split(',').map((entry) => entry.trim())
  if (
    addresses.length > 0 &&
    addresses.every(
      (entry) => entry.length > 0 && isValidTrustProxyAddress(entry),
    )
  ) {
    return addresses
  }

  throw new Error(
    `TRUST_PROXY must be false, a non-negative integer, or a comma-separated list of addresses, received "${raw}"`,
  )
}

const app = express()

const trustProxyValue = parseTrustProxy(process.env.TRUST_PROXY)
if (trustProxyValue !== undefined) {
  app.set('trust proxy', trustProxyValue)
}

app.disable('x-powered-by')
app.use(helmet())
app.use(cors(corsOptions))
app.use(responseTime())
app.use(bodyParser.json({ limit: '2mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '2mb' }))
app.use(requestLogger)
app.use(accessLogger)
app.use(activityLogger)
app.use(routes)

let cachedSpec: unknown

app.get('/__openapi.json', (_request, response) => {
  cachedSpec ??= serviceSpec().document
  response.json(cachedSpec)
})

app.use(notFoundHandler)
app.use(
  process.env.NODE_ENV === 'development' &&
    process.env.DEVELOPMENT_ERROR_PAGE === 'true'
    ? developmentErrorHandler
    : errorHandler,
)

export default app
