import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import request from 'supertest'

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

type Mods = {
  detect: typeof import('@/services/live-script/detect.js')
  suggest: typeof import('@/services/live-script/suggest.js')
  session: typeof import('@/services/live-script/session.js')
  obs: typeof import('@/services/live-script/obs.js')
  transcription: typeof import('@/services/live-script/transcription.js')
  overlay: typeof import('@/services/video/overlay.js')
}
let m: Mods

// The unit tests inject every model call, so nothing here needs a key or the network.
beforeAll(async () => {
  delete process.env.HOOK_MACHINE_MOCK_AI
  process.env.HOOK_MACHINE_DATA_DIR = mkdtempSync(
    path.join(os.tmpdir(), 'ls-session-'),
  )
  jest.resetModules()
  m = {
    detect: await import('@/services/live-script/detect.js'),
    suggest: await import('@/services/live-script/suggest.js'),
    session: await import('@/services/live-script/session.js'),
    obs: await import('@/services/live-script/obs.js'),
    transcription: await import('@/services/live-script/transcription.js'),
    overlay: await import('@/services/video/overlay.js'),
  }
})

const OFFER = {
  price: '299 บาท',
  promotion: 'ซื้อสองแถมหนึ่ง',
  stock: '',
  endsAt: '',
}

const playbook = () => ({
  openingHooks: [
    {
      text: 'สวัสดีครับ วันนี้มีปากกาเจลมาให้ดู',
      grade: 'B+' as const,
      note: '',
      source: 'original' as const,
    },
  ],
  newcomerLines: [
    {
      text: 'ใครเพิ่งเข้ามา เรากำลังดูปากกาเจลกันอยู่',
      grade: 'B+' as const,
      note: '',
    },
  ],
  pitches: [
    {
      label: 'ตัวอย่าง',
      seconds: 60,
      lines: [
        { part: 'problem' as const, text: 'ปากกาที่หมึกเลอะมือ ใครเคยเจอบ้าง' },
        { part: 'demo' as const, text: 'ลองเขียนให้ดูตรงนี้ หมึกแห้งไวมาก' },
        { part: 'proof' as const, text: 'เขียนแล้วแตะได้เลย ไม่เลอะมือ' },
        { part: 'cta' as const, text: 'สนใจกดสั่งได้เลยนะครับ' },
      ],
    },
  ],
  sellingPoints: ['หมึกแห้งไว', 'เขียนลื่น'],
  chatPrompts: ['ใครใช้ปากกาเจลอยู่ พิมพ์มาบอกหน่อย'],
  objections: [
    {
      question: 'หมึกซึมไหม',
      answer: 'หมึกแห้งไว ไม่เลอะมือ',
      ifUnknown: 'ขอเช็กข้อมูลตรงนี้แล้วบอกอีกทีนะ',
    },
  ],
  transitions: [{ label: 'ไปต่อ', text: 'ต่อไปมาดูเรื่องการเขียนกัน' }],
  closing: ['ขอบคุณที่อยู่ด้วยกันนะครับ'],
  cues: [
    { where: 'opening' as const, kind: 'product' as const, note: 'ถือปากกา' },
  ],
})

// The show document the session needs, built straight from the types.
const showDoc = (ownerId = 'user-a') =>
  ({
    id: crypto.randomUUID(),
    ownerId,
    createdAt: new Date().toISOString(),
    status: 'ready',
    step: null,
    stepIndex: 5,
    error: null,
    errorCode: null,
    mock: false,
    language: 'th',
    profileId: null,
    profileName: null,
    style: null,
    input: {
      notes: 'หมึกแห้งไว 5 วินาที',
      productUrl: null,
      offer: OFFER,
      imageCount: 0,
    },
    brief: {
      productName: 'ปากกาเจล',
      category: 'เครื่องเขียน',
      audience: '',
      keywords: [],
      searchQueries: [],
      visibleFacts: [],
    },
    research: {
      facts: [{ claim: 'หมึกแห้งไว 5 วินาที', source: 'user', sourceUrl: null }],
      sellingPoints: [],
      painPoints: [],
      objections: [],
      claimsToVerify: [],
      sources: [],
      warnings: [],
    },
    hooks: null,
    show: null,
    playbook: playbook(),
    verified: true,
    warnings: [],
  }) as unknown as import('@/services/live-script/types.js').LiveShowDoc

const newSession = (owner = 'user-a', showOnStream = false) => {
  const s = m.session.startSession({
    ownerId: owner,
    show: showDoc(owner),
    showOnStream,
  })
  if (!s) throw new Error('no session')
  return s
}

const noModel = {
  detect: { decide: async () => ({}) },
  suggest: {
    generate: (async () => {
      throw new Error('offline')
    }) as never,
  },
}

describe('detect', () => {
  const input = () => ({
    recent: '',
    latest: 'ราคาเท่าไหร่ครับ',
    productName: 'ปากกาเจล',
    sellingPoints: ['หมึกแห้งไว', 'เขียนลื่น'],
    facts: ['หมึกแห้งไว 5 วินาที'],
    offer: OFFER,
    allowed: new Set(['299', '5']),
  })

  it('reads a Decisions answer', () => {
    const read = m.detect.readDecision(
      {
        answers: [
          { name: 'stage', type: 'choice', choice: 'price', confidence: 0.9 },
          { name: 'topic', type: 'choice', choice: 't1', confidence: 0.8 },
          { name: 'about_product', type: 'predicate', probability: 0.9 },
          { name: 'risky', type: 'predicate', probability: 0.1 },
          { name: 'unsupported', type: 'predicate', probability: 0.2 },
        ],
      },
      input(),
    )
    expect(read).toMatchObject({
      stage: 'price',
      topicIndex: 1,
      aboutProduct: true,
      via: 'decisions',
    })
  })

  it('treats a refused or unsure answer as not usable', () => {
    expect(m.detect.readDecision({ answers: [] }, input())).toBeNull()
    expect(
      m.detect.readDecision(
        { answers: [{ name: 'stage', type: 'refusal' }] },
        input(),
      ),
    ).toBeNull()
    const unsure = m.detect.readDecision(
      {
        answers: [
          { name: 'stage', type: 'choice', choice: 'price', confidence: 0.1 },
        ],
      },
      input(),
    )
    expect(unsure?.stage).toBe('unknown')
  })

  it('always flags a number nobody supplied', () => {
    const read = m.detect.readDecision(
      {
        answers: [
          {
            name: 'stage',
            type: 'choice',
            choice: 'features',
            confidence: 0.9,
          },
          { name: 'unsupported', type: 'predicate', probability: 0 },
        ],
      },
      { ...input(), latest: 'กันน้ำได้ 90 เมตรเลยนะ' },
    )
    expect(read?.unsupported).toBeGreaterThanOrEqual(0.9)
  })

  it('has word rules for the plain cases', () => {
    const h = (latest: string) =>
      m.detect.classifyHeuristic({ ...input(), latest })
    expect(h('สวัสดีครับทุกคน').stage).toBe('open')
    expect(h('ราคาเท่าไหร่').stage).toBe('price')
    expect(h('วันนี้มีโปรแถมให้ด้วย').stage).toBe('offer')
    expect(h('ขอบคุณทุกคนนะครับ').stage).toBe('close')
    expect(h('หมึกแห้งไวมาก').topicIndex).toBe(0)
    expect(h('รักษาโรคได้เลยนะ').risky).toBeGreaterThan(0.7)
    expect(h('กันน้ำได้ 90 เมตร').unsupported).toBeGreaterThan(0.7)
    expect(m.detect.guessLanguage('hello everyone welcome')).toBe('en')
    expect(m.detect.guessLanguage('สวัสดี hello')).toBe('th')
  })

  it('falls back from Decisions to the model, then to word rules', async () => {
    m.detect.resetDecisionsBreaker()
    const classify = jest.fn(async () => ({
      stage: 'offer' as const,
      topicIndex: -1,
      aboutProduct: true,
      risky: false,
      unsupported: false,
    }))
    const viaModel = await m.detect.detect(input(), undefined, {
      decide: async () => {
        throw Object.assign(new Error('no'), { status: 500 })
      },
      classify: classify as never,
    })
    expect(viaModel).toMatchObject({ stage: 'offer', via: 'model' })

    const viaWords = await m.detect.detect(input(), undefined, {
      decide: async () => {
        throw new Error('down')
      },
      classify: (async () => {
        throw new Error('down')
      }) as never,
    })
    expect(viaWords).toMatchObject({ stage: 'price', via: 'heuristic' })
  })

  it('stops asking Decisions for a while after a 404, and lets aborts through', async () => {
    m.detect.resetDecisionsBreaker()
    let calls = 0
    const decide = async () => {
      calls++
      throw Object.assign(new Error('missing'), { status: 404 })
    }
    const classify = (async () => {
      throw new Error('down')
    }) as never
    const now = () => 1_000
    await m.detect.detect(input(), undefined, { decide, classify, now })
    await m.detect.detect(input(), undefined, { decide, classify, now })
    expect(calls).toBe(1)
    m.detect.resetDecisionsBreaker()

    const controller = new AbortController()
    controller.abort()
    await expect(
      m.detect.detect(input(), controller.signal, {
        decide: async () => {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' })
        },
      }),
    ).rejects.toThrow()
  })
})

describe('suggestions', () => {
  const ctx = () => {
    const s = newSession()
    return s.ctx
  }

  it('quotes only the offer the seller typed', () => {
    const c = ctx()
    const lines = m.suggest.candidatesFor(
      'price',
      c,
      { topicIndex: null },
      'ราคาเท่าไหร่',
      'th',
    )
    expect(lines.join(' ')).toContain('299 บาท')
    for (const line of lines) {
      expect(m.suggest.vetLine(line, c, 'th')).not.toBeNull()
    }
  })

  it('rejects lines with an untyped number, a fake deadline or a rival brand', () => {
    const c = { ...ctx(), otherBrands: ['Zebra'] }
    expect(m.suggest.vetLine('ลดเหลือ 199 บาท วันนี้เท่านั้น', c, 'th')).toBeNull()
    expect(m.suggest.vetLine('ใช้ Zebra ดีกว่าไหม', c, 'th')).toBeNull()
    expect(m.suggest.vetLine('ราคา 299 บาท', c, 'th')).toBe('ราคา 299 บาท')
    // Quotes, dashes and emoji never reach the seller.
    expect(m.suggest.vetLine('เขียนลื่น — "มาก" 🔥', c, 'th')).not.toMatch(
      /["—🔥]/u,
    )
  })

  it('does not repeat lines already shown', () => {
    const fresh = m.suggest.freshLines(
      ['หมึกแห้งไวมากเลยนะ', 'หมึกแห้งไวมากเลยนะครับ', 'เขียนลื่นสบายมือ'],
      ['หมึกแห้งไวมากเลยนะ'],
    )
    expect(fresh).toEqual(['เขียนลื่นสบายมือ'])
  })

  it('chooses a cue only from what the seller typed', () => {
    const cues = playbook().cues
    expect(m.suggest.cueFor('price', OFFER, cues)).toBe('price')
    expect(m.suggest.cueFor('price', { ...OFFER, price: '' }, cues)).toBeNull()
    expect(m.suggest.cueFor('offer', OFFER, cues)).toBe('promo')
    expect(m.suggest.cueFor('features', OFFER, cues)).toBe('product')
    expect(m.suggest.cueFor('open', OFFER, cues)).toBeNull()
  })

  it('warns, with risk first, in the speaker language', () => {
    expect(
      m.suggest.warningFor({ risky: 0.9, unsupported: 0.9 }, 'th')?.level,
    ).toBe('risk')
    expect(
      m.suggest.warningFor({ risky: 0, unsupported: 0.8 }, 'en')?.level,
    ).toBe('unsupported')
    expect(
      m.suggest.warningFor({ risky: 0.3, unsupported: 0.3 }, 'th'),
    ).toBeNull()
  })

  it('spots a stumble', () => {
    expect(m.suggest.stumbled('เอ่อ อืม คือว่า')).toBe(true)
    expect(m.suggest.stumbled('ปากกา ปากกา ปากกา')).toBe(true)
    expect(m.suggest.stumbled('ตรงนี้คือ...')).toBe(true)
    expect(m.suggest.stumbled('หมึกแห้งไวมาก')).toBe(false)
  })

  it('falls back to the playbook when the model fails, and returns 1 to 3 lines', async () => {
    const c = ctx()
    const detection = m.detect.classifyHeuristic({
      recent: '',
      latest: 'ราคาเท่าไหร่',
      productName: c.productName,
      sellingPoints: c.playbook.sellingPoints,
      facts: c.facts,
      offer: c.offer,
      allowed: c.allowed,
    })
    const suggestion = await m.suggest.buildSuggestion(
      {
        ctx: c,
        detection,
        latest: 'ราคาเท่าไหร่',
        recent: 'ราคาเท่าไหร่',
        used: [],
        lastLines: [],
        hesitation: false,
        timeoutMs: 1000,
      },
      noModel.suggest,
    )
    expect(suggestion?.next.length).toBeGreaterThanOrEqual(1)
    expect(suggestion?.next.length).toBeLessThanOrEqual(3)
    expect(suggestion?.stage).toBe('price')
    expect(suggestion?.cue).toBe('price')
  })

  it('writes fresh lines only while the time budget allows, and answers from the playbook otherwise', async () => {
    const c = ctx()
    const detection = m.detect.classifyHeuristic({
      recent: '',
      latest: 'ราคาเท่าไหร่',
      productName: c.productName,
      sellingPoints: c.playbook.sellingPoints,
      facts: c.facts,
      offer: c.offer,
      allowed: c.allowed,
    })
    const generate = jest.fn(async () => ({ next: ['ราคา 299 บาท ครับ'] }))
    const base = {
      ctx: c,
      detection,
      latest: 'ราคาเท่าไหร่',
      recent: '',
      used: [],
      lastLines: [],
      hesitation: false,
    }
    const late = await m.suggest.buildSuggestion(
      { ...base, timeoutMs: 100 },
      { generate: generate as never },
    )
    expect(generate).not.toHaveBeenCalled()
    expect(late?.next.length).toBeGreaterThan(0)
    const fast = await m.suggest.buildSuggestion(
      { ...base, timeoutMs: 1500 },
      { generate: generate as never },
    )
    expect(generate).toHaveBeenCalledTimes(1)
    expect(fast?.next).toEqual(['ราคา 299 บาท ครับ'])
  })

  it('shows long playbook sentences a clause at a time, never cut mid word', () => {
    const long =
      'นึกถึงตอนรีบจดตามคนพูด ปลายปากกาไปถึงคำถัดไปแล้ว แต่สันมือยังทับอยู่แถวคำก่อนหน้า ถ้าหมึกตรงนั้นยังไม่แห้ง มือก็ปาดโดน ยิ่งกำลังฟังประโยคถัดไปอยู่'
    const parts = m.suggest.chunks(long)
    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(Array.from(part).length).toBeLessThanOrEqual(90)
      expect(long).toContain(part)
    }
    expect(m.suggest.chunks('ราคา 189 บาท')).toEqual(['ราคา 189 บาท'])
  })

  it('answers a viewer question with the closest objection', () => {
    const c = ctx()
    const lines = m.suggest.candidatesFor(
      'objection',
      c,
      { topicIndex: null },
      'หมึกซึมไหมครับ',
      'th',
    )
    expect(lines[0]).toContain('หมึกแห้งไว')
  })

  it('opens with a gentle correction after a risky sentence, once', async () => {
    const c = ctx()
    const detection = {
      stage: 'features' as const,
      topicIndex: null,
      aboutProduct: true,
      risky: 0.9,
      unsupported: 0,
      via: 'heuristic' as const,
    }
    const input = {
      ctx: c,
      detection,
      latest: 'รักษาโรคได้',
      recent: '',
      used: [] as string[],
      lastLines: [],
      hesitation: false,
      timeoutMs: 0,
    }
    const first = await m.suggest.buildSuggestion(input, noModel.suggest)
    expect(first?.next[0]).toContain('ขอเช็กข้อมูลตรงนี้')
    expect(first?.next.length).toBeGreaterThan(1)
    const again = await m.suggest.buildSuggestion(
      { ...input, used: first?.next ?? [] },
      noModel.suggest,
    )
    expect(again?.next[0]).not.toContain('ขอเช็กข้อมูลตรงนี้')
  })

  it('shows a safe line when only a warning can be given', async () => {
    const c = {
      ...ctx(),
      playbook: {
        ...playbook(),
        pitches: [],
        openingHooks: [],
        newcomerLines: [],
        objections: [],
        chatPrompts: [],
        sellingPoints: [],
        transitions: [],
        closing: [],
      },
    }
    const out = await m.suggest.buildSuggestion(
      {
        ctx: c,
        detection: {
          stage: 'unknown',
          topicIndex: null,
          aboutProduct: false,
          risky: 0.9,
          unsupported: 0,
          via: 'heuristic',
        },
        latest: 'รักษาโรคได้',
        recent: '',
        used: [],
        lastLines: [],
        hesitation: false,
        timeoutMs: 1000,
      },
      noModel.suggest,
    )
    expect(out?.warning?.level).toBe('risk')
    expect(out?.next).toHaveLength(1)
  })
})

describe('OBS events', () => {
  const suggestion = (over = {}) => ({
    id: crypto.randomUUID(),
    topic: null,
    productName: null,
    stage: 'price' as const,
    next: ['ราคา 299 บาท', 'ซื้อสองแถมหนึ่ง'],
    cue: null,
    warning: null,
    hesitation: false,
    ...over,
  })

  it('builds events that the overlay hub accepts', () => {
    const schema = m.overlay.overlayEvent
    const prompter = m.obs.prompterEvent(
      suggestion({
        warning: { text: 'ตรวจก่อนพูดต่อ', level: 'risk' as const },
      }),
    )
    expect(schema.parse(prompter)).toMatchObject({
      type: 'prompter',
      payload: { stage: 'price', warning: 'ตรวจก่อนพูดต่อ' },
    })
    expect(prompter.payload.lines).toHaveLength(2)
    expect(schema.parse(m.obs.captionEvent(suggestion()))).toMatchObject({
      type: 'caption',
      payload: { text: 'ราคา 299 บาท ซื้อสองแถมหนึ่ง' },
    })
  })

  it('keeps events inside the hub limits', () => {
    const long = 'ก'.repeat(400)
    const event = m.obs.prompterEvent(
      suggestion({ next: [long, long, long, long] }),
    )
    expect(event.payload.lines).toHaveLength(3)
    for (const line of event.payload.lines) {
      expect(Array.from(line).length).toBeLessThanOrEqual(160)
    }
    expect(() => m.overlay.overlayEvent.parse(event)).not.toThrow()
    expect(m.obs.truncate('สวัสดี', 4)).toBe('สวั…')
  })

  it('sends the caption only when the seller turned it on, and swallows failures', async () => {
    const sent: { type: string }[] = []
    const publish = async (_: string, body: unknown) => {
      sent.push(body as { type: string })
    }
    await m.obs.pushToObs('user-a', suggestion(), false, publish)
    expect(sent.map((e) => e.type)).toEqual(['prompter'])
    sent.length = 0
    await m.obs.pushToObs('user-a', suggestion(), true, publish)
    expect(sent.map((e) => e.type)).toEqual(['prompter', 'caption'])
    await expect(
      m.obs.pushToObs('user-a', suggestion(), true, async () => {
        throw new Error('overlay down')
      }),
    ).resolves.toBeUndefined()
  })
})

describe('listening session', () => {
  const quick = (text: string, tsMs: number, final = true) => ({
    text,
    final,
    tsMs,
  })

  it('keeps partial results light: no model call, no suggestion', async () => {
    const s = newSession()
    const decide = jest.fn()
    const out = await m.session.submitUtterance(s, quick('ราคา', 100, false), {
      detect: { decide },
      publish: async () => undefined,
    })
    expect(out).toBeNull()
    expect(decide).not.toHaveBeenCalled()
    expect(s.partial).toBe('ราคา')
  })

  it('suggests after a final sentence and sends it to OBS', async () => {
    const s = newSession('user-a', true)
    const sent: { type: string }[] = []
    const out = await m.session.submitUtterance(
      s,
      quick('ราคาเท่าไหร่ครับ', 1000),
      {
        ...noModel,
        publish: async (_u, body) => {
          sent.push(body as { type: string })
        },
      },
    )
    expect(out?.stage).toBe('price')
    expect(out?.next.join(' ')).toContain('299 บาท')
    await new Promise((r) => setImmediate(r))
    expect(sent.map((e) => e.type)).toEqual(['prompter', 'caption'])
  })

  it('drops a stale sentence and runs only one computation at a time', async () => {
    const s = newSession()
    let running = 0
    let peak = 0
    let release: () => void = () => undefined
    const decide = jest.fn(async (_body: unknown, signal?: AbortSignal) => {
      running++
      peak = Math.max(peak, running)
      try {
        // Only the first sentence is slow; it is still running when the others arrive.
        if (decide.mock.calls.length === 1) {
          await new Promise<void>((resolve, reject) => {
            release = resolve
            signal?.addEventListener('abort', () =>
              reject(
                Object.assign(new Error('aborted'), { name: 'AbortError' }),
              ),
            )
          })
        }
        return {}
      } finally {
        running--
      }
    })
    const deps = {
      detect: {
        decide: decide as never,
        classify: (async () => {
          throw new Error('offline')
        }) as never,
      },
      suggest: noModel.suggest,
      publish: async () => undefined,
    }
    const first = m.session.submitUtterance(s, quick('ราคาเท่าไหร่', 1000), deps)
    await new Promise((r) => setImmediate(r))
    const second = m.session.submitUtterance(s, quick('มีโปรไหมครับ', 2500), deps)
    const third = m.session.submitUtterance(s, quick('ขอบคุณครับ', 4000), deps)
    // The first sentence was replaced, the second was replaced before it started.
    expect(await first).toBeNull()
    expect(await second).toBeNull()
    release()
    const answer = await third
    expect(peak).toBe(1)
    expect(answer?.stage).toBe('close')
    // Only the first and the newest sentence ever reached the classifier.
    expect(decide.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('never repeats a line back to back', async () => {
    const s = newSession()
    const deps = { ...noModel, publish: async () => undefined }
    const seen = new Set<string>()
    let ts = 1000
    for (const text of ['ราคาเท่าไหร่', 'ราคาเท่าไหร่ครับ', 'บอกราคาอีกทีนะ']) {
      const out = await m.session.submitUtterance(s, quick(text, ts), deps)
      ts += 3000
      for (const line of out?.next ?? []) {
        expect(seen.has(line)).toBe(false)
        seen.add(line)
      }
    }
    expect(seen.size).toBeGreaterThan(0)
  })

  it('marks hesitation after a long pause or a stumble', async () => {
    const s = newSession()
    const deps = { ...noModel, publish: async () => undefined }
    const calm = await m.session.submitUtterance(
      s,
      quick('หมึกแห้งไวมากเลย', 5000),
      deps,
    )
    expect(calm?.hesitation).toBe(false)
    const stumble = await m.session.submitUtterance(
      s,
      quick('เอ่อ อืม คือว่า', 8000),
      deps,
    )
    expect(stumble?.hesitation).toBe(true)
    // A long silence before a sentence, on a session with fresh lines to show.
    const quiet = newSession()
    await m.session.submitUtterance(quiet, quick('หมึกแห้งไวมาก', 1000), deps)
    await m.session.submitUtterance(quiet, quick('เขียน', 30_000, false), deps)
    const paused = await m.session.submitUtterance(
      quiet,
      quick('เขียนลื่นมากเลย', 32_000),
      deps,
    )
    expect(paused?.hesitation).toBe(true)
  })

  it('keeps only the last minute and a bounded transcript', async () => {
    const s = newSession()
    const deps = { ...noModel, publish: async () => undefined }
    for (let i = 0; i < 60; i++) {
      await m.session.submitUtterance(
        s,
        quick(`หมึกแห้งไวมากเลยนะครับ ${'ก'.repeat(300)}`, i * 5000),
        deps,
      )
    }
    expect(s.finals.length).toBeLessThanOrEqual(40)
    expect(s.finals.reduce((n, f) => n + f.text.length, 0)).toBeLessThanOrEqual(
      6000,
    )
    const oldest = s.finals[0]?.tsMs ?? 0
    const newest = s.finals[s.finals.length - 1]?.tsMs ?? 0
    expect(newest - oldest).toBeLessThanOrEqual(60_000)
  })

  it('has one session per account and hides it from other accounts', () => {
    const a1 = newSession('user-a')
    const b1 = newSession('user-b')
    const a2 = newSession('user-a')
    expect(m.session.ownedSession('user-a', a1.id)).toBeNull()
    expect(m.session.ownedSession('user-a', a2.id)).toBe(a2)
    expect(m.session.ownedSession('user-a', b1.id)).toBeNull()
    expect(m.session.endSession('user-a', b1.id)).toBe(false)
    expect(m.session.endSession('user-b', b1.id)).toBe(true)
  })

  it('sweeps sessions that heard nothing for the idle limit', () => {
    const s = newSession('user-a')
    const limit = 4 * 60 * 60 * 1000
    expect(m.session.sweepSessions(s.lastActivity + limit - 1000)).toBe(0)
    expect(m.session.sweepSessions(s.lastActivity + limit)).toBe(1)
    expect(m.session.ownedSession('user-a', s.id)).toBeNull()
  })
})

describe('transcription grant', () => {
  it('cleans keywords', () => {
    expect(
      m.transcription.cleanKeywords([
        'ปากกาเจล',
        'ปากกาเจล',
        '<x>',
        null,
        'a',
        '  Zebra\nPen  ',
      ]),
    ).toEqual(['ปากกาเจล', 'Zebra Pen'])
  })

  it('has a mock grant shaped like the real one', async () => {
    const grant = await m.transcription.mintMock({
      userId: 'user-a',
      keywords: ['ปากกาเจล'],
    })
    expect(grant.clientSecret).toMatch(/^ek_mock_/)
    expect(grant.url).toBe(m.transcription.REALTIME_URL)
    expect(grant.vad.silenceMs).toBe(700)
    expect(grant.sessionUpdate.audio.input.turn_detection).toBeNull()
    expect(grant.sessionUpdate.audio.input.transcription).toMatchObject({
      languages: ['th', 'en'],
      keywords: ['ปากกาเจล'],
    })
  })
})

describe('live session api', () => {
  let app: import('express').Express
  const base = '/agent/live-script'
  const as = (who: 'a' | 'b' = 'a') => {
    const agent = request(app)
    const cookie = `so_session=${who.repeat(43)}`
    return {
      get: (url: string) => agent.get(url).set('Cookie', cookie),
      post: (url: string) => agent.post(url).set('Cookie', cookie),
      delete: (url: string) => agent.delete(url).set('Cookie', cookie),
    }
  }

  beforeAll(async () => {
    process.env.HOOK_MACHINE_DATA_DIR = mkdtempSync(
      path.join(os.tmpdir(), 'ls-session-api-'),
    )
    process.env.HOOK_MACHINE_MOCK_AI = 'true'
    jest.resetModules()
    app = (await import('@/app.js')).default
  })

  const readyShow = async (who: 'a' | 'b' = 'a') => {
    const created = await as(who)
      .post(`${base}/shows`)
      .send({ brief: 'ปากกาเจล หมึกแห้งไว', offer: OFFER })
    expect(created.status).toBe(202)
    const id = created.body.show.id as string
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 50))
      const { body } = await as(who).get(`${base}/shows/${id}`)
      if (body.show.status === 'ready') return id
      if (body.show.status === 'error') throw new Error(body.show.error)
    }
    throw new Error('show never became ready')
  }

  it('needs a ready playbook and an owner', async () => {
    expect(
      (await as().post(`${base}/shows/${crypto.randomUUID()}/session`).send({}))
        .status,
    ).toBe(404)
    expect(
      (await as().post(`${base}/shows/not-a-uuid/session`).send({})).status,
    ).toBe(404)
  })

  it('runs a whole listening session', async () => {
    const showId = await readyShow('a')
    const started = await as('a')
      .post(`${base}/shows/${showId}/session`)
      .send({})
    expect(started.status).toBe(201)
    const { sessionId, transcription, showOnStream, prompterPath } =
      started.body
    expect(showOnStream).toBe(false)
    expect(prompterPath).toBe('/overlay/prompter.html')
    expect(transcription).toMatchObject({
      model: expect.any(String),
      vad: { silenceMs: 700 },
    })
    expect(typeof transcription.clientSecret).toBe('string')

    // Another account cannot reach it at all.
    const utter = (who: 'a' | 'b', body: object) =>
      as(who).post(`${base}/sessions/${sessionId}/utterance`).send(body)
    expect(
      (await utter('b', { text: 'ราคา', final: true, tsMs: 1 })).status,
    ).toBe(404)
    expect(
      (await as('b').post(`${base}/sessions/${sessionId}/secret`).send({}))
        .status,
    ).toBe(404)
    expect((await as('b').delete(`${base}/sessions/${sessionId}`)).status).toBe(
      404,
    )

    // Validation.
    expect((await utter('a', { text: '', final: true, tsMs: 1 })).status).toBe(
      422,
    )
    expect(
      (await utter('a', { text: 'x'.repeat(1001), final: true, tsMs: 1 }))
        .status,
    ).toBe(422)
    expect(
      (await utter('a', { text: 'ราคา', final: 'yes', tsMs: 1 })).status,
    ).toBe(422)
    expect((await utter('a', { text: 'ราคา', final: true })).status).toBe(422)

    const partial = await utter('a', { text: 'ราคา', final: false, tsMs: 100 })
    expect(partial.status).toBe(200)
    expect(partial.body).toMatchObject({ success: true, suggestion: null })

    const final = await utter('a', {
      text: 'ราคาเท่าไหร่ครับ',
      final: true,
      tsMs: 900,
    })
    expect(final.status).toBe(200)
    const suggestion = final.body.suggestion
    expect(suggestion).toMatchObject({
      stage: 'price',
      warning: null,
      hesitation: false,
    })
    expect(suggestion.next.length).toBeGreaterThanOrEqual(1)
    expect(suggestion.next.length).toBeLessThanOrEqual(3)

    const secret = await as('a')
      .post(`${base}/sessions/${sessionId}/secret`)
      .send({})
    expect(secret.status).toBe(200)
    expect(secret.body.transcription.clientSecret).toMatch(/^ek_mock_/)

    // Starting again replaces the old session.
    const again = await as('a')
      .post(`${base}/shows/${showId}/session`)
      .send({ showOnStream: true })
    expect(again.body.showOnStream).toBe(true)
    expect(
      (await utter('a', { text: 'ราคา', final: true, tsMs: 2000 })).status,
    ).toBe(404)

    const ended = await as('a').delete(
      `${base}/sessions/${again.body.sessionId}`,
    )
    expect(ended.status).toBe(200)
    expect(
      (await as('a').delete(`${base}/sessions/${again.body.sessionId}`)).status,
    ).toBe(404)
  })

  it('needs a signed in account', async () => {
    expect(
      (await request(app).post(`${base}/shows/x/session`).send({})).status,
    ).toBe(401)
    expect(
      (await request(app).post(`${base}/sessions/x/secret`).send({})).status,
    ).toBe(401)
    expect((await request(app).delete(`${base}/sessions/x`)).status).toBe(401)
  })
})
