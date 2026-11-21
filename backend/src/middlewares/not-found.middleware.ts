import type { RequestHandler } from 'express'

import { createErrorKey } from '@/constants/error-code.js'
import { AppError } from '@/services/error.service.js'

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError('NOT_FOUND', {
      key: createErrorKey('route', `${request.method}-${request.path}`),
    }),
  )
}
