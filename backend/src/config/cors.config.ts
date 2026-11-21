import type { CorsOptions } from 'cors'

const allowedOrigins = (process.env.APP_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

if (allowedOrigins.length === 0 && process.env.NODE_ENV === 'production') {
  throw new Error(
    'APP_ORIGINS must be set in production; an empty value would reflect any origin while credentials are enabled',
  )
}

const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (allowedOrigins.length === 0) {
      callback(null, true)
      return
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(null, false)
  },
}

export default corsOptions
