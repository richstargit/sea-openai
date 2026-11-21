import type { Annotations } from '@/docs/introspect.js'

export const ANNOTATIONS: Annotations = {
  'GET /': {
    tags: ['Service'],
    summary: 'Service identity',
    description: 'Returns the service name and version.',
  },
  'GET /health': {
    tags: ['Service'],
    summary: 'Health check',
    description:
      'Lightweight liveness endpoint. Add dependency readiness checks separately when the service gains required dependencies.',
  },
}
