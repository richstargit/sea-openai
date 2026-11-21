import { Router } from 'express'

import { serviceConfig } from '@/config/service.config.js'
import healthRoutes from '@/routes/health.route.js'
import hookMachineRoutes from '@/routes/hook-machine.route.js'

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
router.use('/api/hook-machine', hookMachineRoutes)

export default router
