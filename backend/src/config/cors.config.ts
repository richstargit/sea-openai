import type { CorsOptions } from 'cors'
import type { RequestHandler } from 'express'
import { AppError } from '@/services/error.service.js'

const allowedOrigins = (process.env.APP_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  throw new Error(
    'APP_ORIGINS must be set in production; an empty value would reflect any origin while credentials are enabled',
  )
}

if (!allowedOrigins.length)
  allowedOrigins.push('http://localhost:3000', 'http://127.0.0.1:3000')

export const checkBrowserOrigin: RequestHandler = (
  request,
  _response,
  next,
) => {
  const origin = request.get('origin')
  if (
    origin
      ? allowedOrigins.includes(origin) ||
        origin === `${request.protocol}://${request.get('host')}`
      : request.get('sec-fetch-site') !== 'cross-site'
  )
    return next()
  next(new AppError('FORBIDDEN', { key: 'so-auth-origin-forbidden' }))
}

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(null, false)
  },
}

export default corsOptions
