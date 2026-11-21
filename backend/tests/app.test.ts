import request from 'supertest'

import app, { parseTrustProxy } from '@/app.js'

describe('AstraFlow service template', () => {
  it('returns service identity', async () => {
    const response = await request(app).get('/')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        service: expect.any(String),
        version: expect.any(String),
      }),
    )
    expect(response.headers['x-request-id']).toEqual(expect.any(String))
  })

  it('exposes a health endpoint', async () => {
    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual(
      expect.objectContaining({
        success: true,
        status: 'ok',
        uptimeSeconds: expect.any(Number),
      }),
    )
  })

  it('returns normalized 404 errors', async () => {
    const response = await request(app).get('/missing')

    expect(response.status).toBe(404)
    expect(response.body).toEqual(
      expect.objectContaining({
        success: false,
        code: 'af-e404',
        key: expect.any(String),
        requestId: expect.any(String),
      }),
    )
  })

  it('rejects unsafe trust proxy true', () => {
    expect(() => parseTrustProxy('true')).toThrow(/rejected/)
  })
})
