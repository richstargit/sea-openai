import { Router } from 'express'

import { serviceConfig } from '@/config/service.config.js'
import healthRoutes from '@/routes/health.route.js'

const router = Router()

router.get('/', (_request, response) => {
  const service = serviceConfig()
  response.json({
    success: true,
    service: service.name,
    version: service.version,
  })
})

router.use('/health', healthRoutes)

export default router
