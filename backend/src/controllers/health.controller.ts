import type { RequestHandler } from 'express'

import { serviceConfig } from '@/config/service.config.js'

const startedAt = Date.now()

export const healthCheck: RequestHandler = (_request, response) => {
  const service = serviceConfig()

  response.json({
    success: true,
    service: service.name,
    version: service.version,
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  })
}
