import sharp from 'sharp'
import request from 'supertest'
import app from '@/app.js'
import { StoredFile } from '@/models/agent-storage.model.js'
import { LiveProduct } from '@/models/live-product.model.js'
import { createOpenAIResponse } from '@/services/openai.service.js'

jest.mock('@/services/openai.service.js', () => ({ createOpenAIResponse: jest.fn() }))
jest.mock('@/models/mongo.js', () => ({
  ...jest.requireActual('@/models/mongo.js'),
  mongo: (operation: () => PromiseLike<unknown>) => operation(),
}))
jest.mock('@/services/auth.service.js', () => ({
  ...jest.requireActual('@/services/auth.service.js'),
  sessionUser: jest.fn().mockResolvedValue({ id: 'owner', email: 'owner@example.test' }),
}))

const respond = jest.mocked(createOpenAIResponse)
const lean = (value: unknown) => ({ lean: async () => value }) as never
const product = { _id: 'p1', userId: 'owner', code: 'A12', name: 'ครีมกันแดด', description: 'หลอดสีขาว ฝาส้ม', distinct: '', price: 290, imageIds: ['f1'] }
const send = (body: object) => request(app).post('/agent/live/locate').set('Cookie', `so_session=${'a'.repeat(43)}`).send(body)
const answer = (value: object) => respond.mockResolvedValue({ output_text: JSON.stringify(value), output: [] } as never)

let frame: string
let photo: Buffer
beforeAll(async () => {
  const square = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ff7a00' } }).png().toBuffer()
  const scene = await sharp({ create: { width: 160, height: 90, channels: 3, background: '#ffffff' } }).composite([{ input: square, left: 40, top: 30 }]).png().toBuffer()
  frame = 'data:image/png;base64,' + scene.toString('base64')
  photo = square
})
beforeEach(() => {
  respond.mockReset()
  jest.spyOn(LiveProduct, 'findOne').mockImplementation(((filter: { code: string }) => lean(filter.code === 'A12' ? product : null)) as never)
  jest.spyOn(StoredFile, 'find').mockReturnValue(lean([{ bytes: { buffer: photo } }]))
})
afterEach(() => jest.restoreAllMocks())

describe('POST /agent/live/locate', () => {
  it('asks Sol with the catalog card first and the ruled frame last, and returns the box as fractions', async () => {
    answer({ scene_evidence: 'orange cap visible', box: { left: 250, top: 330, right: 375, bottom: 555 } })
    const { body } = await send({ image: frame, code: 'A12' }).expect(200)
    expect(body.box.x).toBeCloseTo(0.25)
    expect(body.box.y).toBeCloseTo(0.33)
    expect(body.box.w).toBeCloseTo(0.125)
    expect(body.box.h).toBeCloseTo(0.225)
    expect(body).toMatchObject({ evidence: 'orange cap visible', latencyMs: expect.any(Number) })
    const sent = respond.mock.calls[0]?.[0] as unknown as { model: string; input: { content: { type: string; text?: string }[] }[] }
    expect(sent.model).toBe('gpt-6.2-sol')
    expect(sent.input[0]?.content.map((c) => c.type)).toEqual(['input_text', 'input_image', 'input_text', 'input_image'])
    expect(sent.input[0]?.content[0]?.text).toContain('A12')
  })

  it('returns a null box when the product is not in the frame', async () => {
    answer({ scene_evidence: 'no orange cap anywhere', box: null })
    expect((await send({ image: frame, code: 'A12' }).expect(200)).body).toMatchObject({ box: null, evidence: 'no orange cap anywhere' })
  })

  it('answers 404 for a code that is not in the catalog, without calling the model', async () => {
    await send({ image: frame, code: 'NOPE' }).expect(404)
    expect(respond).not.toHaveBeenCalled()
  })

  it.each([
    ['not a data URL', 'http://example.com/x.jpg', 422],
    ['bytes that are not an image', 'data:image/jpeg;base64,' + Buffer.from('not an image').toString('base64'), 400],
  ])('rejects an invalid image (%s)', async (_name, image, status) => {
    const response = await send({ image, code: 'A12' })
    expect(response.status).toBe(status)
    expect(respond).not.toHaveBeenCalled()
  })
})
