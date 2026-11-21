import errorhandler from 'errorhandler'

import { logger } from '@/services/logger.service.js'
import { pathWithoutQuery } from '@/utils/request-path.js'

export const developmentErrorHandler = errorhandler({
  log(error, message, request) {
    logger.error('DEVELOPMENT_ERROR', error, {
      method: request.method,
      path: pathWithoutQuery(request.originalUrl),
      message,
    })
  },
})
