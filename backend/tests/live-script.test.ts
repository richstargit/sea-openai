import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import request from 'supertest'

import {
  allowedNumbers,
  bannedPunctuation,
  cleanSpoken,
  dedupe,
  engagementCount,
  numbersIn,
  placeEvenly,
  rehookCount,
  similarity,
  speakSeconds,
  spreadMinutes,
  unsupportedNumbers,
  urgencyViolation,
} from '@/services/live-script/checks.js'
import {
  finalizeHooks,
  finalizeShow,
  sharedEnding,
} from '@/services/live-script/finalize.js'
import { createShowBody } from '@/controllers/live-script.controller.js'
import { liveShowSchema } from '@/services/live-script/schemas.js'

// Two throwaway accounts, told apart by the first character of the session cookie.
jest.mock('@/services/auth.service.js', () => {
  const { AppError } = jest.requireActual('@/services/error.service.js')
  const users: Record<string, { id: string; email: string }> = {
    a: { id: 'user-a', email: 'a@example.test' },
    b: { id: 'user-b', email: 'b@example.test' },
  }
  return {
    ...jest.requireActual('@/services/auth.service.js'),
    sessionUser: jest.fn(async (token: string) => {
      const user = users[token.charAt(0)]
      if (!user)
        throw new AppError('UNAUTHORIZED', { key: 'so-auth-login-required' })
      return user
    }),
  }
})

const as = (app: import('express').Express, who: 'a' | 'b' = 'a') => {
  const agent = request(app)
  const cookie = `so_session=${who.repeat(43)}`
  return {
    get: (url: string) => agent.get(url).set('Cookie', cookie),
    post: (url: string) => agent.post(url).set('Cookie', cookie),
    delete: (url: string) => agent.delete(url).set('Cookie', cookie),
  }
}

const OFFER = {
  price: '299 บาท',
  promotion: 'ลด 20 เปอร์เซ็นต์',
  stock: 'เหลือ 50 ชิ้น',
  endsAt: 'ถึง 3 ทุ่ม',
}
const NO_OFFER = { price: '', promotion: '', stock: '', endsAt: '' }

describe('spoken line cleanup', () => {
  it('removes quotes, dashes and emoji but keeps apostrophes inside words', () => {
    expect(cleanSpoken('เขาบอกว่า "ดีมาก" 🔥', 'th')).toBe('เขาบอกว่า ดีมาก')
    expect(cleanSpoken('ราคา 3-5 วัน', 'th')).toBe('ราคา 3 ถึง 5 วัน')
    expect(cleanSpoken('ลดถึง -50 องศา', 'th')).toBe('ลดถึง ลบ 50 องศา')
    expect(cleanSpoken('ใช้ง่าย — ไม่ยุ่งยาก', 'th')).toBe('ใช้ง่าย, ไม่ยุ่งยาก')
    expect(cleanSpoken('Wi-Fi ready', 'en')).toBe('Wi Fi ready')
    expect(cleanSpoken("don't wait 'quote'", 'en')).toBe("don't wait quote")
  })

  it('reports what was found', () => {
    expect(bannedPunctuation('plain text')).toEqual([])
    expect(bannedPunctuation('say "hi" 😀 now - ok').sort()).toEqual([
      'dash',
      'emoji',
      'quote',
    ])
    expect(bannedPunctuation("don't")).toEqual([])
  })
})

describe('numbers and urgency', () => {
  it('reads numbers in Thai digits and with separators', () => {
    expect(numbersIn('ราคา ๑,๒๙๙ บาท ลด 9.5 และ 007')).toEqual([
      '1299',
      '9.5',
      '7',
    ])
  })

  it('flags numbers nobody supplied', () => {
    const allowed = allowedNumbers([OFFER.price, OFFER.stock, 'ใช้ได้ 55 ชั่วโมง'])
    expect(unsupportedNumbers('ราคา 299 บาท เหลือ 50 ชิ้น', allowed)).toEqual([])
    expect(unsupportedNumbers('ลดเหลือ 199 บาท', allowed)).toEqual(['199'])
    expect(unsupportedNumbers('มี 3 ข้อที่ต้องรู้', allowed)).toEqual([])
    // A small number next to a unit is a claim, not a count.
    expect(unsupportedNumbers('ลดอีก 2 บาท', allowed)).toEqual(['2'])
    expect(unsupportedNumbers('ราคา ฿2', allowed)).toEqual(['2'])
  })

  it('allows urgency only when the seller supplied the detail', () => {
    expect(urgencyViolation('เหลือ 50 ชิ้นเท่านั้น', OFFER)).toBeNull()
    expect(urgencyViolation('เหลือไม่กี่ชิ้นแล้ว', NO_OFFER)).toMatch(/stock/)
    expect(
      urgencyViolation('หมดเขตวันนี้เท่านั้น', { ...NO_OFFER, stock: 'มีเยอะ' }),
    ).toMatch(/time/)
    expect(urgencyViolation('รีบกดเลย ห้ามพลาด', NO_OFFER)).toMatch(/offer/)
    expect(
      urgencyViolation('รีบกดเลย', { ...NO_OFFER, promotion: 'แถมถุง' }),
    ).toBeNull()
    expect(urgencyViolation('ใช้ง่ายมาก', NO_OFFER)).toBeNull()
  })
})

describe('repeat detection and scheduling', () => {
  it('sees near duplicates in Thai, which has no spaces', () => {
    expect(
      similarity(
        'ใครเพิ่งเข้ามา ตอนนี้กำลังโชว์สินค้า',
        'ใครเพิ่งเข้ามา ตอนนี้กำลังโชว์สินค้านะ',
      ),
    ).toBeGreaterThan(0.6)
    expect(
      similarity('ใครเพิ่งเข้ามา ตอนนี้กำลังโชว์สินค้า', 'มีคำถามอะไรพิมพ์มาได้เลย'),
    ).toBeLessThan(0.3)
  })

  it('keeps the first of near duplicates and respects lines used elsewhere', () => {
    const lines = ['เข้ามาแล้วดูสินค้าตัวนี้กัน', 'เข้ามาแล้วดูสินค้าตัวนี้กันนะ', 'ถามได้ทุกเรื่อง']
    expect(dedupe(lines, (l) => l).kept).toEqual([lines[0], lines[2]])
    expect(dedupe(lines, (l) => l, ['ถามได้ทุกเรื่อง']).kept).toEqual([lines[0]])
  })

  it('spreads lines evenly with rising minutes inside the stream', () => {
    expect(spreadMinutes(5, 30)).toEqual([5, 10, 15, 20, 25])
    const placed = placeEvenly([{ t: 'a' }, { t: 'b' }, { t: 'c' }], 60)
    expect(placed.map((p) => p.atMinute)).toEqual([15, 30, 45])
    const crowded = spreadMinutes(9, 10)
    expect(crowded.every((m, i) => i === 0 || m > (crowded[i - 1] ?? 0))).toBe(
      true,
    )
  })

  it('sizes the schedule from the length of the live', () => {
    expect([rehookCount(30), rehookCount(60), rehookCount(180)]).toEqual([
      5, 10, 10,
    ])
    expect([engagementCount(30), engagementCount(90)]).toEqual([3, 8])
  })

  it('estimates spoken length per language', () => {
    // The same measured rate the video script budget uses: 10.5 Thai characters or 3.4 words a second.
    expect(speakSeconds('ก'.repeat(105), 'th')).toBe(10)
    expect(speakSeconds('one two three four five six', 'en')).toBe(2)
  })
})

describe('run of show rules', () => {
  const ctx = (offer = OFFER) => ({
    language: 'th' as const,
    liveMinutes: 30,
    offer,
    allowed: allowedNumbers([
      offer.price,
      offer.promotion,
      offer.stock,
      offer.endsAt,
      '30',
    ]),
  })

  it('keeps opening hooks honest: grade floors, cleanup, invented numbers', () => {
    const { hooks, warnings } = finalizeHooks(
      {
        formatMatched: [
          { formatLabel: 'a', text: 'ลองดูของดี "ใช้ทุกวัน"', grade: 'B', note: '' },
          { formatLabel: 'b', text: 'อ่อนเกินไป', grade: 'D', note: '' },
        ],
        skippedFormats: [{ formatLabel: 'c', reason: 'ต้องแต่งตัวเลข' }],
        original: [
          { text: 'ราคา 299 บาท วันนี้', grade: 'A', note: '' },
          { text: 'ลดเหลือ 199 บาท', grade: 'A+', note: '' },
          { text: 'พอใช้ได้', grade: 'B', note: '' },
        ],
      },
      ctx(),
    )
    expect(hooks.formatMatched.map((h) => h.text)).toEqual(['ลองดูของดี ใช้ทุกวัน'])
    expect(hooks.original.map((h) => h.text)).toEqual(['ราคา 299 บาท วันนี้'])
    expect(hooks.skippedFormats).toHaveLength(1)
    expect(warnings.join(' ')).toContain('199')
  })

  const base = {
    rehooks: [],
    engagement: [],
    objections: [],
    transitions: [],
    closing: [],
    cues: [],
  }
  const line = (
    part: 'hook' | 'problem' | 'demo' | 'proof' | 'offer' | 'cta',
    text: string,
  ) => ({ part, text })

  it('drops invented urgency, extra calls to action and incomplete segments', () => {
    const { show, warnings } = finalizeShow(
      {
        ...base,
        segment: {
          variants: [
            {
              label: 'ดี',
              lines: [
                line('hook', 'ดูของดีกัน'),
                line('demo', 'ลองหยิบดูได้เลย'),
                line('cta', 'กดตะกร้าเลย'),
                line('cta', 'กดอีกครั้งเลย'),
              ],
            },
            {
              label: 'ไม่มีคำชวน',
              lines: [line('hook', 'เริ่มกัน'), line('demo', 'ลองดู')],
            },
            {
              label: 'เร่งมั่ว',
              lines: [line('hook', 'เหลือ 7 ชิ้นสุดท้าย'), line('cta', 'กดเลย')],
            },
          ],
        },
      },
      ctx(NO_OFFER),
      [],
    )
    expect(show.segment.variants).toHaveLength(1)
    const only = show.segment.variants[0]
    expect(only?.lines.filter((l) => l.part === 'cta')).toHaveLength(1)
    expect(warnings.join(' ')).toContain('คำชวนซื้อที่เกินหนึ่งครั้ง')
  })

  it('skips one bad supporting line instead of losing the whole pitch', () => {
    const { show } = finalizeShow(
      {
        ...base,
        segment: {
          variants: [
            {
              label: 'ครบ',
              lines: [
                line('hook', 'ดูของดีกัน'),
                line('problem', 'หลายคนเจอปัญหาเดิม'),
                line('proof', 'เหลือแค่ไม่กี่ชิ้นแล้วรีบเลย'),
                line('demo', 'ลองหยิบดูได้เลย'),
                line('cta', 'กดตะกร้าเลย'),
              ],
            },
            {
              label: 'เสียฮุก',
              lines: [
                line('hook', 'รีบเลยห้ามพลาด'),
                line('problem', 'ปัญหาเดิม'),
                line('demo', 'ลองดู'),
                line('cta', 'กดเลย'),
              ],
            },
          ],
        },
      },
      ctx(NO_OFFER),
      [],
    )
    expect(show.segment.variants.map((v) => v.label)).toEqual(['ครบ'])
    expect(show.segment.variants[0]?.lines.map((l) => l.part)).toEqual([
      'hook',
      'problem',
      'demo',
      'cta',
    ])
  })

  it('notices re-hooks that all close with the same invitation', () => {
    const tail = 'อยู่คุยกันได้ ถามในแชตเลย'
    expect(
      sharedEnding([
        `สีสวย ${tail}`,
        `ขนาดพอดี ${tail}`,
        `ฝาปิดสนิท ${tail}`,
        'ไม่เหมือนใคร',
      ]),
    ).toBeTruthy()
    expect(sharedEnding([`สีสวย ${tail}`, 'ขนาดพอดีมือ', 'ฝาปิดสนิทมาก'])).toBeNull()
  })

  it('never repeats an opening hook as a re-hook and spaces the rest out', () => {
    const opening = ['ใครเพิ่งเข้ามา มาดูของดีกัน']
    const { show } = finalizeShow(
      {
        ...base,
        rehooks: [
          { text: 'ใครเพิ่งเข้ามา มาดูของดีกันนะ', grade: 'A', note: '' },
          { text: 'ตอนนี้กำลังลองใช้ให้ดูใกล้ๆ', grade: 'B+', note: '' },
          { text: 'มาทันพอดี เรากำลังตอบคำถามกัน', grade: 'B+', note: '' },
          { text: 'ยังไม่ผ่านเกณฑ์', grade: 'B', note: '' },
        ],
        segment: { variants: [] },
      },
      ctx(),
      opening,
    )
    expect(show.rehooks.map((r) => r.text)).toEqual([
      'ตอนนี้กำลังลองใช้ให้ดูใกล้ๆ',
      'มาทันพอดี เรากำลังตอบคำถามกัน',
    ])
    expect(show.rehooks.map((r) => r.atMinute)).toEqual([10, 20])
  })

  it('keeps overlay cues to details the seller supplied', () => {
    const cue = (kind: 'price' | 'promo' | 'gift' | 'flash' | 'product') => ({
      where: 'segment_offer' as const,
      kind,
      note: 'เปิดป้าย',
    })
    const raw = {
      ...base,
      segment: { variants: [] },
      cues: [cue('price'), cue('promo'), cue('flash'), cue('product')],
    }
    expect(
      finalizeShow(raw, ctx(NO_OFFER), []).show.cues.map((c) => c.kind),
    ).toEqual(['product'])
    expect(finalizeShow(raw, ctx(), []).show.cues.map((c) => c.kind)).toEqual([
      'price',
      'promo',
      'flash',
      'product',
    ])
  })
})

describe('request schema', () => {
  it('fills defaults and bounds the inputs', () => {
    const parsed = createShowBody.parse({ brief: 'ปากกา' })
    expect(parsed).toMatchObject({
      brief: 'ปากกา',
      images: [],
      offer: NO_OFFER,
    })
    // No live length and no language: the seller just keeps talking.
    expect(parsed).not.toHaveProperty('minutes')
    expect(parsed).not.toHaveProperty('language')
    expect(() => createShowBody.parse({ images: ['http://x/y.png'] })).toThrow()
    expect(() => createShowBody.parse({ profileId: 'nope' })).toThrow()
    expect(() => createShowBody.parse({ brief: 'x'.repeat(4001) })).toThrow()
    expect(() =>
      createShowBody.parse({ offer: { price: 'x'.repeat(200) } }),
    ).toThrow()
  })

  it('accepts what the demo fixtures return', async () => {
    const { mockFor } = await import('@/services/live-script/fixtures.js')
    expect(() => liveShowSchema.parse(mockFor('live_show'))).not.toThrow()
  })
})

describe('live script api', () => {
  let app: import('express').Express

  beforeAll(async () => {
    process.env.HOOK_MACHINE_DATA_DIR = mkdtempSync(
      path.join(os.tmpdir(), 'ls-test-'),
    )
    process.env.HOOK_MACHINE_MOCK_AI = 'true'
    jest.resetModules()
    app = (await import('@/app.js')).default
  })

  const base = '/agent/live-script'

  it('needs a signed in account', async () => {
    expect((await request(app).get(`${base}/options`)).status).toBe(401)
    expect(
      (await request(app).post(`${base}/shows`).send({ brief: 'x' })).status,
    ).toBe(401)
    expect(
      (await request(app).post(`${base}/sessions/x/utterance`).send({})).status,
    ).toBe(401)
  })

  it('publishes the rubric and limits', async () => {
    const response = await as(app).get(`${base}/options`)
    expect(response.status).toBe(200)
    expect(response.body.principles).toHaveLength(5)
    expect(response.body.prompterPath).toBe('/overlay/prompter.html')
  })

  it('validates requests', async () => {
    const send = (body: object) => as(app).post(`${base}/shows`).send(body)
    // Nothing to work from.
    expect((await send({})).status).toBe(400)
    // Only a link is not enough: a photo or a brief is required.
    expect(
      (await send({ productUrl: 'https://example.com/p' })).status,
    ).toBe(400)
    expect(
      (await send({ brief: 'x', productUrl: 'http://localhost/x' })).status,
    ).toBe(400)
    expect(
      (await send({ brief: 'x', profileId: crypto.randomUUID() })).status,
    ).toBe(404)
    expect((await send({ brief: 'x', images: ['nope'] })).status).toBe(422)
    expect(
      (
        await as(app)
          .post(`${base}/shows/not-a-uuid/reply`)
          .send({ comment: 'hi' })
      ).status,
    ).toBe(404)
  })

  it('builds a playbook, keeps it private and answers comments', async () => {
    const created = await as(app)
      .post(`${base}/shows`)
      .send({ brief: 'ปากกาเจล', offer: OFFER })
    expect(created.status).toBe(202)
    const id = created.body.show.id as string
    expect(created.body.show).toMatchObject({
      status: 'running',
      stepCount: 5,
      playbook: null,
    })
    // The stored document keeps no photos and the answer has no input echo.
    expect(created.body.show).not.toHaveProperty('input')
    expect(created.body.show).not.toHaveProperty('schedule')
    expect(created.body.show).not.toHaveProperty('minutes')

    type Playbook = {
      openingHooks: { text: string }[]
      newcomerLines: unknown[]
      pitches: { lines: { part: string }[] }[]
      chatPrompts: string[]
      cues: { kind: string }[]
    }
    let show: {
      status: string
      error: string | null
      stepIndex: number
      product: { name: string } | null
      playbook: Playbook | null
    } | null = null
    for (let i = 0; i < 60 && show?.status !== 'ready'; i++) {
      await new Promise((r) => setTimeout(r, 50))
      show = (await as(app).get(`${base}/shows/${id}`)).body.show
      if (show?.status === 'error') throw new Error(show.error ?? 'show failed')
    }
    expect(show?.status).toBe('ready')
    expect(show?.stepIndex).toBe(5)
    expect(show?.product?.name).toBeTruthy()
    const playbook = show?.playbook
    expect(playbook?.openingHooks.length).toBeGreaterThan(0)
    expect(playbook?.newcomerLines.length).toBeGreaterThan(0)
    expect(playbook?.chatPrompts.length).toBeGreaterThan(0)
    for (const pitch of playbook?.pitches ?? []) {
      expect(pitch.lines.filter((l) => l.part === 'cta')).toHaveLength(1)
    }

    // Another account sees nothing of it.
    const b = as(app, 'b')
    expect((await b.get(`${base}/shows/${id}`)).status).toBe(404)
    expect((await b.delete(`${base}/shows/${id}`)).status).toBe(404)
    expect(
      (
        await b
          .post(`${base}/shows/${id}/reply`)
          .send({ comment: 'ราคาเท่าไหร่' })
      ).status,
    ).toBe(404)
    expect((await b.get(`${base}/shows`)).body.shows).toEqual([])
    expect(
      (await as(app).get(`${base}/shows`)).body.shows.map(
        (s: { id: string }) => s.id,
      ),
    ).toEqual([id])

    const reply = await as(app)
      .post(`${base}/shows/${id}/reply`)
      .send({ comment: 'ราคาเท่าไหร่' })
    expect(reply.status).toBe(200)
    expect(['answered', 'unknown', 'declined']).toContain(
      reply.body.reply.status,
    )
    expect(typeof reply.body.reply.text).toBe('string')
    expect(
      (await as(app).post(`${base}/shows/${id}/reply`).send({ comment: '' }))
        .status,
    ).toBe(422)

    // A finished show can be deleted, by its owner only.
    expect((await as(app).delete(`${base}/shows/${id}`)).status).toBe(200)
    expect((await as(app).get(`${base}/shows/${id}`)).status).toBe(404)
  })
})

describe('grounding the research', () => {
  const digest = (
    facts: { claim: string; source: 'user' | 'image' | 'web' }[],
  ) => ({
    facts: facts.map((f) => ({ ...f, sourceUrl: null })),
    sellingPoints: ['เก็บเย็นได้ 12 ชั่วโมง', 'ลดเหลือ 748 บาท'],
    painPoints: [],
    objections: [],
    claimsToVerify: ['อายุการใช้งาน'],
  })

  it('moves facts whose numbers the seller never supplied into the verify list', async () => {
    const { groundDigest } = await import('@/services/live-script/grounding.js')
    const result = groundDigest(
      digest([
        { claim: 'ราคา 399 บาท', source: 'user' },
        // The model worked this out itself: not typed by the seller.
        { claim: 'ซื้อ 2 ใบเหลือ 748 บาท', source: 'user' },
        { claim: 'เก็บเย็นได้ 12 ชั่วโมง', source: 'web' },
        { claim: 'ทนความร้อน 100 องศา', source: 'web' },
      ]),
      ['ราคา 399 บาท ซื้อ 2 ใบ ลดเพิ่ม 50 บาท'],
      ['ผู้ผลิตระบุว่าเก็บความเย็นได้ 12 ชั่วโมง'],
    )
    expect(result.digest.facts.map((f) => f.claim)).toEqual([
      'ราคา 399 บาท',
      'เก็บเย็นได้ 12 ชั่วโมง',
    ])
    expect(result.digest.sellingPoints).toEqual(['เก็บเย็นได้ 12 ชั่วโมง'])
    expect(result.digest.claimsToVerify).toEqual(
      expect.arrayContaining([
        'อายุการใช้งาน',
        'ซื้อ 2 ใบเหลือ 748 บาท',
        'ทนความร้อน 100 องศา',
        'ลดเหลือ 748 บาท',
      ]),
    )
    expect(result.warnings).toHaveLength(1)
  })
})

describe('source check pass', () => {
  const hooks = {
    formatMatched: [],
    skippedFormats: [],
    original: [
      { text: 'ฮุกที่หนึ่ง', grade: 'A' as const, note: '' },
      { text: 'ฮุกที่สอง', grade: 'A' as const, note: '' },
    ],
  }
  const show = {
    rehooks: ['a', 'b', 'c'].map((t, i) => ({
      atMinute: 10 * (i + 1),
      text: t,
      grade: 'A' as const,
      note: '',
    })),
    engagement: [],
    segment: {
      targetSeconds: [60, 90] as [number, number],
      variants: [0, 1].map((n) => ({
        label: `v${n}`,
        seconds: 60,
        lines: [
          { part: 'hook' as const, text: `h${n}` },
          { part: 'cta' as const, text: `c${n}` },
        ],
      })),
    },
    objections: [
      { question: 'q1', answer: 'a1', ifUnknown: 'u1' },
      { question: 'q2', answer: 'a2', ifUnknown: 'u2' },
    ],
    transitions: [],
    closing: ['c1'],
    cues: [],
  }

  it('lists the lines that make claims, with stable ids', async () => {
    const { collectCandidates } = await import(
      '@/services/live-script/verify.js'
    )
    const ids = collectCandidates(hooks, show).map((c) => c.id)
    expect(ids).toEqual([
      'hook:original:0',
      'hook:original:1',
      'rehook:0',
      'rehook:1',
      'rehook:2',
      'variant:0:0',
      'variant:0:1',
      'variant:1:0',
      'variant:1:1',
      'objection:0',
      'objection:1',
      'closing:0',
    ])
  })

  it('removes flagged lines and re-spreads the schedule', async () => {
    const { dropFlagged } = await import('@/services/live-script/verify.js')
    const out = dropFlagged(
      hooks,
      show,
      new Set(['hook:original:1', 'rehook:1', 'objection:0']),
      60,
      'th',
    )
    expect(out.hooks.original.map((h) => h.text)).toEqual(['ฮุกที่หนึ่ง'])
    expect(out.show.rehooks.map((r) => [r.text, r.atMinute])).toEqual([
      ['a', 20],
      ['c', 40],
    ])
    expect(out.show.objections.map((o) => o.question)).toEqual(['q2'])
    expect(out.dropped).toBe(3)
  })

  it('trims a pitch variant but keeps it while it can still be said', async () => {
    const { dropFlagged } = await import('@/services/live-script/verify.js')
    const line = (
      part: 'hook' | 'problem' | 'demo' | 'proof' | 'cta',
      text: string,
    ) => ({ part, text })
    const pitch = {
      ...show,
      segment: {
        targetSeconds: [60, 90] as [number, number],
        variants: [0, 1, 2].map((n) => ({
          label: `v${n}`,
          seconds: 60,
          lines: [
            line('hook', `h${n}`),
            line('problem', `p${n}`),
            line('demo', `d${n}`),
            line('proof', `x${n}`),
            line('cta', `c${n}`),
          ],
        })),
      },
    }
    const out = dropFlagged(
      hooks,
      pitch,
      // v0 loses a demo line (kept), v1 loses its hook (dropped), v2 loses three lines (too short).
      new Set([
        'variant:0:2',
        'variant:1:0',
        'variant:2:1',
        'variant:2:2',
        'variant:2:3',
      ]),
      60,
      'th',
    )
    expect(out.show.segment.variants.map((v) => v.label)).toEqual(['v0'])
    expect(out.show.segment.variants[0]?.lines.map((l) => l.part)).toEqual([
      'hook',
      'problem',
      'proof',
      'cta',
    ])
    expect(out.dropped).toBe(5)
  })
})
