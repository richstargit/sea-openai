import request from 'supertest'
import app from '@/app.js'
import { openAIClient, createOpenAIResponse } from '@/services/openai.service.js'

jest.mock('@/services/openai.service.js', () => ({
  ...jest.requireActual('@/services/openai.service.js'),
  createOpenAIResponse: jest.fn(),
  openAIClient: jest.fn(),
}))
jest.mock('@/services/auth.service.js', () => ({
  ...jest.requireActual('@/services/auth.service.js'),
  sessionUser: jest.fn().mockResolvedValue({ id: 'owner', email: 'owner@example.test' }),
}))

const create = jest.fn()
const respond = jest.mocked(createOpenAIResponse)
const cookie = `so_session=${'a'.repeat(43)}`
const transcribe = (query = '') => request(app).post('/agent/live/transcribe' + query).set('Cookie', cookie).set('Content-Type', 'audio/webm')
const understand = (body: object) => request(app).post('/agent/live/understand').set('Cookie', cookie).send(body)
const answer = (value: object) => respond.mockResolvedValue({ output: [{ type: 'function_call', name: 'understand_speech', arguments: JSON.stringify(value) }] } as never)
const base = { corrected: 'ครีมกันแดด 290 บาท', productId: 'p1', price: 290, from: null, to: null, left: null, code: null, intent: 'price', combo: { main: null, accent: null, caption: null } }
const products = [{ id: 'p1', name: 'ครีมกันแดด', price: 290 }]

beforeEach(() => {
  create.mockReset()
  jest.mocked(openAIClient).mockReturnValue({ audio: { transcriptions: { create } } } as never)
  respond.mockReset()
})

describe('POST /agent/live/transcribe', () => {
  it('passes the hint as the prompt and returns the text', async () => {
    create.mockResolvedValue({ text: ' ครีมกันแดด ' })
    const res = await transcribe('?lang=th&hint=ครีมกันแดด').send(Buffer.from('audio'))
    expect(res.status).toBe(200)
    expect(res.body.text).toBe('ครีมกันแดด')
    expect(typeof res.body.latencyMs).toBe('number')
    expect(create.mock.calls[0][0]).toMatchObject({ prompt: 'ครีมกันแดด', language: 'th' })
  })
  it('returns empty text for silence and rejects an empty body', async () => {
    create.mockResolvedValue({ text: '' })
    expect((await transcribe().send(Buffer.from('x'))).body.text).toBe('')
    expect((await transcribe().send(Buffer.alloc(0))).status).toBe(400)
  })
})

describe('POST /agent/live/understand', () => {
  it('returns the parsed fields', async () => {
    answer(base)
    const res = await understand({ text: 'ครีมกันแดด สองร้อยเก้าสิบ', products })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject(base)
    expect(res.body.latencyMs).toBeGreaterThanOrEqual(0)
  })
  it('drops a productId the catalog does not have', async () => {
    answer({ ...base, productId: 'ghost' })
    expect((await understand({ text: 'hi', products })).body.productId).toBeNull()
  })
  it('keeps combo ids only from the given motions and caps the caption', async () => {
    answer({ ...base, combo: { main: 'price_pop', accent: 'ghost', caption: 'x'.repeat(40) } })
    const motions = { main: [{ id: 'price_pop', description: 'price' }], accent: [{ id: 'edge-glow', description: 'hype' }] }
    const res = await understand({ text: 'hi', products, motions })
    expect(res.body.combo).toEqual({ main: 'price_pop', accent: null, caption: 'x'.repeat(24) })
    answer({ ...base, combo: { main: 'price_pop', accent: 'edge-glow', caption: null } })
    expect((await understand({ text: 'hi', products })).body.combo).toEqual({ main: null, accent: null, caption: null })
  })
  it('rejects bad input', async () => {
    expect((await understand({ text: '' })).status).toBe(422)
    expect((await understand({ text: 'x'.repeat(1001) })).status).toBe(422)
  })
})
