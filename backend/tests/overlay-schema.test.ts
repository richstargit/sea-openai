// schema only: keep the renderer (and its ESM media deps) out of this test
jest.mock('@/services/video/render.js', () => ({
  renderOverlayMotion: jest.fn(),
}))

import { overlayEvent } from '@/services/video/overlay.js'

const ok = (v: unknown) => overlayEvent.safeParse(v).success
it('accepts graphic, LiveCut and zoom events, rejects junk', () => {
  expect(
    ok({
      type: 'price_pop',
      payload: { text: '290.-', productId: 'A12' },
      ttl: 2000,
    }),
  ).toBe(true)
  expect(
    ok({
      type: 'product_card',
      payload: {
        name: 'ครีม',
        image: 'data:image/png;base64,' + 'A'.repeat(5000),
      },
    }),
  ).toBe(true)
  expect(
    ok({
      type: 'poll',
      payload: { question: 'สีไหน', options: [{ label: 'ชมพู', votes: 3 }] },
    }),
  ).toBe(true)
  expect(
    ok({
      type: 'zoom',
      payload: { box: { x: 0.4, y: 0.3, w: 0.2, h: 0.4 }, name: 'A12' },
      ttl: 3000,
    }),
  ).toBe(true)
  expect(ok({ type: 'zoom_out' })).toBe(true)
  expect(ok({ type: 'sound', name: 'whoosh-big' })).toBe(true)
  expect(ok({ type: 'sound', name: '../etc/passwd' })).toBe(false)
  expect(
    ok({
      type: 'graphic',
      preset: 'strike-compare-ink',
      data: { from: 490, to: 290 },
      x: 0.5,
      y: 0.5,
    }),
  ).toBe(true)
  expect(ok({ type: 'graphic', preset: 'Bad Preset!' })).toBe(false)
  expect(
    ok({ type: 'zoom', payload: { box: { x: 0.9, y: 0.3, w: 0.2, h: 0.4 } } }),
  ).toBe(false)
  expect(ok({ type: 'price_pop', payload: { text: 'x'.repeat(500) } })).toBe(
    false,
  )
  expect(
    ok({ type: 'price_pop', payload: { image: 'javascript:alert(1)' } }),
  ).toBe(false)
})
