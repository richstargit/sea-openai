import { designMotions, motionsBody } from '@/services/live/motions.js'
import { select } from '@/services/video/direction.js'

jest.mock('@/services/video/direction.js', () => ({ select: jest.fn() }))

const layer = (o: object = {}) => ({
  kind: 'text', text: '{name}', x: 10, y: 10, w: 50, h: 10, size: 6, weight: 700, color: 'text', bg: 'none', radius: 0, align: 'left',
  in: 'fade-up', at: 0, dur: 0.5, hold: 'none', out: 'fade', outAt: 3, value: 0, from: 0, prefix: '', suffix: '', thickness: 0, ...o,
})
const motion = (o: object = {}) => ({ id: 'slam', name: 'ราคาทุบ', moment: 'price', description: 'ราคาใหญ่เต็มจอ', seconds: 4, layers: [layer(), layer({ kind: 'panel', text: '', bg: 'accent' })], ...o })
const body = motionsBody.parse({ shop: 'ร้านนี้', products: [{ name: 'ครีม', price: 290 }], count: 8 })
const run = async (motions: object[], count = 8) => {
  jest.mocked(select).mockResolvedValue({ motions } as never)
  return designMotions({ ...body, count }, AbortSignal.timeout(5000))
}

describe('designMotions', () => {
  it('returns sanitized motions with latency', async () => {
    const result = await run([motion()])
    expect(result.motions).toHaveLength(1)
    expect(result.motions[0]).toMatchObject({ id: 'slam', moment: 'price', seconds: 4 })
    expect(result.motions[0].layers[0]).toMatchObject({ kind: 'text', in: 'fade-up', out: 'fade' })
    expect(typeof result.latencyMs).toBe('number')
    expect(jest.mocked(select).mock.calls[0][5]).toBe(600 + 8 * 350)
  })
  it('clamps out-of-range numbers and forces an exit', async () => {
    const [m] = (await run([motion({ seconds: 99, layers: [layer({ x: 90, w: 80, y: 120, size: 90, at: 50, out: 'none', outAt: 0, in: 'count-up' }), layer()] })])).motions
    expect(m.seconds).toBe(6)
    expect(m.layers[0]).toMatchObject({ x: 90, w: 10, y: 100, size: 14, in: 'fade', out: 'fade' })
    expect(Number(m.layers[0].at)).toBeLessThanOrEqual(5.2)
    expect(Number(m.layers[0].outAt)).toBeLessThanOrEqual(6)
  })
  it('drops a motion with bad layers', async () => {
    const result = await run([motion({ id: 'bad', layers: [layer({ color: 'javascript:x' }), layer({ kind: 'nope' }), layer()] }), motion({ id: 'ok' })])
    expect(result.motions.map((m) => m.id)).toEqual(['ok'])
  })
  it('dedupes ids and honours count and moments', async () => {
    const result = await run([motion(), motion(), motion({ moment: 'intro', id: 'x' })], 2)
    expect(result.motions.map((m) => m.id)).toEqual(['slam', 'slam-2'])
  })
  it('rejects count > 12 and bad bodies', () => {
    expect(motionsBody.safeParse({ count: 13 }).success).toBe(false)
    expect(motionsBody.safeParse({ products: [{ name: 'x' }] }).success).toBe(false)
    expect(motionsBody.safeParse({ moments: ['nope'] }).success).toBe(false)
  })
})
