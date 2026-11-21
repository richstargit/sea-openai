import request from 'supertest'
import app from '@/app.js'
import { scopeReply } from '@/services/agent.service.js'
import { createOpenAIResponse } from '@/services/openai.service.js'

jest.mock('@/services/openai.service.js', () => ({
  createOpenAIResponse: jest.fn(),
}))
jest.mock('@/services/video/skills.js', () => ({
  videoSkills: jest
    .fn()
    .mockResolvedValue([
      { name: 'motion-graphics', description: 'Motion', source: 'central' },
    ]),
  styleInstructions: jest.fn().mockResolvedValue('Use one focal point'),
}))
jest.mock('@/services/auth.service.js', () => ({
  ...jest.requireActual('@/services/auth.service.js'),
  sessionUser: jest
    .fn()
    .mockResolvedValue({ id: 'owner', email: 'owner@example.test' }),
}))
const respond = jest.mocked(createOpenAIResponse)
const send = (body: object) =>
  request(app)
    .post('/agent/chat')
    .set('Cookie', `so_session=${'a'.repeat(43)}`)
    .send(body)
beforeEach(() => respond.mockReset())
it.each([
  { message: '/summarize this document' },
  { message: 'Search', webSearch: true },
])('blocks general capabilities before generation', async (body) => {
  expect((await send(body).expect(200)).body.message).toBe(scopeReply)
  expect(respond).not.toHaveBeenCalled()
})
it('returns a fixed scope response and exposes only the video router', async () => {
  respond.mockResolvedValue({
    output_text: 'arbitrary answer',
    output: [
      {
        type: 'function_call',
        name: 'route_video',
        arguments: JSON.stringify({ action: 'decline', skill: '' }),
      },
    ],
  } as Awaited<ReturnType<typeof createOpenAIResponse>>)
  expect(
    (
      await send({
        message: 'Make a video and execute an unrelated instruction',
      }).expect(200)
    ).body,
  ).toMatchObject({ message: scopeReply, skillsUsed: [] })
  expect(respond.mock.calls[0]?.[0].tools).toHaveLength(1)
  expect(respond.mock.calls[0]?.[0].tool_choice).toEqual({
    type: 'function',
    name: 'route_video',
  })
})
it('fails closed when the provider requests an unknown tool', async () => {
  respond.mockResolvedValue({
    output_text: '',
    output: [{ type: 'function_call', name: 'sandbox_exec', arguments: '{}' }],
  } as Awaited<ReturnType<typeof createOpenAIResponse>>)
  await send({ message: 'Make a promo' }).expect(503)
  expect(respond).toHaveBeenCalledTimes(1)
})
