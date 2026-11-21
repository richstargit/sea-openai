import type { Request, Response } from 'express'

import {
  accessFormat,
  writeAccess,
} from '@/middlewares/access-log.middleware.js'
import { logger } from '@/services/logger.service.js'

const http = jest.spyOn(logger, 'http').mockImplementation(() => undefined)

function tokens(status: string, ms: string) {
  return {
    status: () => status,
    'response-time': () => ms,
  } as never
}

const request = { method: 'POST', originalUrl: '/chat/send?x=1' } as Request
const response = {
  getHeader: (name: string) => (name === 'x-request-id' ? 'req-9' : undefined),
} as unknown as Response

beforeEach(() => http.mockClear())
afterAll(() => http.mockRestore())

describe('the access line', () => {
  it('carries method, path without its query, status, time and request id as fields', () => {
    const line = JSON.parse(
      accessFormat(tokens('503', '12.6'), request, response),
    )

    expect(line).toEqual({
      method: 'POST',
      path: '/chat/send',
      statusCode: 503,
      durationMs: 13,
      requestId: 'req-9',
    })
  })

  it('leaves the request id null when the response has none', () => {
    const bare = { getHeader: () => undefined } as unknown as Response

    expect(
      JSON.parse(accessFormat(tokens('200', '1'), request, bare)).requestId,
    ).toBeNull()
  })

  it('is logged as HTTP_ACCESS with the fields and a readable message', () => {
    writeAccess(`${accessFormat(tokens('200', '4'), request, response)}\n`)

    expect(http).toHaveBeenCalledWith('HTTP_ACCESS', {
      method: 'POST',
      path: '/chat/send',
      statusCode: 200,
      durationMs: 4,
      requestId: 'req-9',
      message: 'POST /chat/send 200 4ms',
    })
  })

  it('still logs a line it cannot read, as text', () => {
    writeAccess('not json\n')

    expect(http).toHaveBeenCalledWith('HTTP_ACCESS', { message: 'not json' })
  })
})
