import { logger } from '@/services/logger.service.js'

export const requestLogger = logger.requestMiddleware()
