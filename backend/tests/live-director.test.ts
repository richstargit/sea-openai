import { decide, decideBody } from '@/services/live/director.js'

const image = 'data:image/jpeg;base64,' + 'A'.repeat(64)
const products = [{ id: 'A12', name: 'ครีมกันแดด', description: 'หลอดสีขาว ฝาส้ม' }]

describe('live director decide', () => {
  const realFetch = global.fetch
  let sent: { model: string; questions: { name: string; choices?: { value: string }[] }[] } | undefined
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    global.fetch = jest.fn(async (_url, init) => {
      sent = JSON.parse(String((init as RequestInit).body))
      return new Response(
        JSON.stringify({
          answers: [
            { type: 'choice', name: 'product', choice: 'A12', confidence: 0.91 },
            { type: 'predicate', name: 'held_up', probability: 0.88 },
            { type: 'choice', name: 'action', choice: 'price_pop', confidence: 0.8 },
            { type: 'choice', name: 'motion', choice: 'price-pop', confidence: 0.76 },
            { type: 'choice', name: 'energy', choice: 'high' },
            { type: 'predicate', name: 'risky_claim', probability: 0.05 },
            { type: 'choice', name: 'team_cmd', choice: 'fireworks' },
          ],
        }),
        { status: 200 },
      )
    }) as typeof fetch
  })
  afterEach(() => {
    global.fetch = realFetch
  })

  it('asks product, pose, action, motion, energy and risk in one Decisions call and reads the answers', async () => {
    const result = await decide(decideBody.parse({ image, transcript: 'ราคา 290 บาท', products }), AbortSignal.timeout(5000))
    expect(sent?.model).toBe('gpt-6-luna')
    expect(sent?.questions.map((q) => q.name)).toEqual(['product', 'held_up', 'action', 'energy', 'risky_claim', 'motion'])
    expect(sent?.questions[0]?.choices?.map((c) => c.value)).toEqual(['A12', 'none'])
    expect(result).toMatchObject({ product: 'A12', productConfidence: 0.91, heldUp: 0.88, action: 'price_pop', motion: 'price-pop', energy: 'high', riskyClaim: 0.05, teamCommand: null })
  })

  it('adds the team command question only when the host says ทีม, and uses the given motions', async () => {
    const result = await decide(
      decideBody.parse({ image, transcript: 'ทีม ขอพลุหน่อย', products, motions: [{ id: 'fireworks', description: 'ฉลอง' }] }),
      AbortSignal.timeout(5000),
    )
    expect(sent?.questions.map((q) => q.name)).toContain('team_cmd')
    expect(sent?.questions.find((q) => q.name === 'motion')?.choices?.map((c) => c.value)).toEqual(['fireworks', 'none'])
    expect(result.teamCommand).toBe('fireworks')
  })

  it('rejects a frame that is not an image data URL', () => {
    expect(decideBody.safeParse({ image: 'http://example.com/x.jpg', products }).success).toBe(false)
  })
})
