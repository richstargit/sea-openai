import { EventEmitter } from 'node:events'
import type { Request, Response } from 'express'

import { ACTIVITY_LOG_SERVICE } from '@/constants/activity-log.js'
import { activityLogger } from '@/middlewares/activity-log.middleware.js'
import { logger } from '@/services/logger.service.js'

const info = jest.spyOn(logger, 'info').mockImplementation(() => undefined)
const originalEnvironment = process.env.NODE_ENV
const originalEnabled = process.env.ACTIVITY_LOG_ENABLED

beforeEach(() => {
  info.mockClear()
  process.env.NODE_ENV = 'development'
  delete process.env.ACTIVITY_LOG_ENABLED
})
afterEach(() => {
  if (originalEnvironment === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = originalEnvironment
  if (originalEnabled === undefined) delete process.env.ACTIVITY_LOG_ENABLED
  else process.env.ACTIVITY_LOG_ENABLED = originalEnabled
})
afterAll(() => info.mockRestore())

function call(method = 'POST', statusCode = 200) {
  const response = Object.assign(new EventEmitter(), {
    locals: { requestId: 'req-activity' },
    statusCode,
    json: jest.fn(),
  }) as unknown as Response
  const request = {
    method,
    originalUrl: '/internal/action?token=secret',
    body: { password: 'secret-password', input: 'hello' },
    ip: '127.0.0.1',
    get: () => 'test-agent',
  } as unknown as Request
  const next = jest.fn()
  activityLogger(request, response, next)
  return { response, next }
}

it('logs a completed activity with the service and redacted bodies', async () => {
  const { response, next } = call()
  response.json({ accessToken: 'secret-token', success: true })
  expect(info).not.toHaveBeenCalled()
  response.emit('finish')
  await Promise.resolve()
  expect(next).toHaveBeenCalledTimes(1)
  expect(info).toHaveBeenCalledTimes(1)
  expect(info).toHaveBeenCalledWith(
    'ACTIVITY_LOG',
    expect.objectContaining({
      service: ACTIVITY_LOG_SERVICE,
      requestId: 'req-activity',
      userId: null,
      method: 'POST',
      path: '/internal/action',
      statusCode: 200,
      durationMs: expect.any(Number),
    }),
  )
  const serialized = JSON.stringify(info.mock.calls[0]?.[1])
  expect(serialized).not.toContain('secret-password')
  expect(serialized).not.toContain('secret-token')
  expect(serialized).toContain('[REDACTED]')
})

it('includes the error key from a failed activity', async () => {
  const { response } = call('DELETE', 403)
  response.json({ key: 'af-forbidden' })
  response.emit('finish')
  await Promise.resolve()
  expect(info).toHaveBeenCalledWith(
    'ACTIVITY_LOG',
    expect.objectContaining({
      statusCode: 403,
      errorKey: 'af-forbidden',
    }),
  )
})

it('keeps the same mutation-only policy as the other services', async () => {
  const { response, next } = call('GET')
  response.emit('finish')
  await Promise.resolve()
  expect(next).toHaveBeenCalledTimes(1)
  expect(info).not.toHaveBeenCalled()
})

it('honors the activity logging switch', async () => {
  process.env.ACTIVITY_LOG_ENABLED = 'false'
  const { response } = call()
  response.emit('finish')
  await Promise.resolve()
  expect(info).not.toHaveBeenCalled()
})
