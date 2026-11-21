import { serviceConfig } from '@/config/service.config.js'
import { cookieName } from '@/controllers/auth.controller.js'
import { ANNOTATIONS } from '@/docs/annotations.js'
import { buildDocument } from '@/docs/introspect.js'
import healthRoutes from '@/routes/health.route.js'
import indexRoutes from '@/routes/index.js'

export function serviceSpec() {
  const service = serviceConfig()

  return buildDocument({
    mounts: [
      { prefix: '', router: indexRoutes },
      { prefix: '/health', router: healthRoutes },
    ],
    title: service.name,
    version: service.version,
    description: service.description,
    annotations: ANNOTATIONS,
    securityScheme: 'sessionCookie',
    securitySchemes: {
      sessionCookie: { type: 'apiKey', in: 'cookie', name: cookieName },
    },
  })
}
