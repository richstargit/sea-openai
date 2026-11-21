import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import request from 'supertest'

import {
  buildInstructions,
  comboProblem,
  languageInfo,
  stylePreset,
} from '@/services/hook-machine/voice/catalog.js'
import {
  retryDelayMs,
  withRetry,
} from '@/services/hook-machine/voice/provider.js'
import {
  charErrorRate,
  compositeScore,
  durationFitScore,
  errorRate,
  intelligibilityScore,
  normalizeText,
  numberWordsToDigits,
  pacingScore,
  rateScore,
  styleScoreFromJudge,
  technicalScore,
  waveStats,
  wordErrorRate,
} from '@/services/hook-machine/voice/scoring.js'
import {
  encodeWav,
  parseWav,
  synthTone,
} from '@/services/hook-machine/voice/wav.js'

const en = languageInfo('en')
const th = languageInfo('th')
if (!en || !th) throw new Error('catalog is missing en or th')

describe('text comparison', () => {
  it('reads number words as digits', () => {
    expect(numberWordsToDigits('it costs forty three baht')).toBe(
      'it costs 43 baht',
    )
    expect(numberWordsToDigits('two hundred and five')).toBe('205')
    expect(numberWordsToDigits('one thousand two hundred')).toBe('1200')
    expect(numberWordsToDigits('one two three four')).toBe('1 2 3 4')
    expect(numberWordsToDigits('no numbers here')).toBe('no numbers here')
  })

  it('normalizes case, punctuation and grouped digits', () => {
    expect(normalizeText('Under 1,000 baht!', 'en')).toBe('under 1000 baht')
  })

  it('scores a spoken number as equal to its digits', () => {
    const rate = errorRate('It costs 43 baht.', 'it costs forty three baht', en)
    expect(rate).toBe(0)
  })

  it('computes word and character error rates', () => {
    expect(wordErrorRate('a b c d', 'a b x d')).toBe(0.25)
    expect(wordErrorRate('a b', '')).toBe(1)
    expect(charErrorRate('สวัสดี', 'สวัสดี')).toBe(0)
    expect(charErrorRate('abcd', 'abxd')).toBe(0.25)
    expect(intelligibilityScore(0.1)).toBe(90)
    expect(intelligibilityScore(2)).toBe(0)
  })

  it('uses characters for Thai and words for English', () => {
    expect(errorRate('ปากกาเจล', 'ปากกาเจล', th)).toBe(0)
    expect(errorRate('one two three four', 'one two three five', en)).toBe(0.25)
  })
})

describe('pacing', () => {
  it('is full inside the band and falls off outside it', () => {
    expect(rateScore(2.8, [2.3, 3.2])).toBe(100)
    expect(rateScore(1.85, [2.3, 3.2])).toBe(50)
    expect(rateScore(0.5, [2.3, 3.2])).toBe(0)
  })

  it('compares length to the target', () => {
    expect(durationFitScore(30, 30)).toBe(100)
    expect(durationFitScore(33, 30)).toBe(100)
    expect(durationFitScore(10, 30)).toBeLessThan(10)
  })

  it('combines rate and fit', () => {
    const text = Array.from({ length: 70 }, (_, i) => `w${i}`).join(' ')
    const good = pacingScore({
      text,
      durationSec: 25,
      targetSec: 25,
      language: en,
    })
    expect(good.rate).toBe(2.8)
    expect(good.score).toBe(100)
    const rushed = pacingScore({
      text,
      durationSec: 12,
      targetSec: 25,
      language: en,
    })
    expect(rushed.score).toBeLessThan(good.score)
  })
})

describe('wav and technical checks', () => {
  it('round trips a wav and reports duration', () => {
    const wav = parseWav(synthTone(1.5))
    expect(wav.sampleRate).toBe(24_000)
    expect(wav.durationSec).toBeCloseTo(1.5, 2)
  })

  it('rejects data that is not a wav', () => {
    expect(() => parseWav(Buffer.from('nope'))).toThrow()
  })

  it('finds silence and clipping from samples', () => {
    const silent = parseWav(encodeWav(new Int16Array(24_000)))
    expect(waveStats(silent).silenceRatio).toBe(1)
    expect(technicalScore(1, 0)).toBeLessThan(50)

    const loud = new Int16Array(24_000).fill(32_767)
    const clipped = waveStats(parseWav(encodeWav(loud)))
    expect(clipped.clipRatio).toBe(1)
    expect(technicalScore(0.1, clipped.clipRatio)).toBeLessThan(65)

    expect(technicalScore(0.2, 0)).toBe(100)
  })
})

describe('composite score', () => {
  it('weights 40 25 25 10', () => {
    expect(
      compositeScore({
        intelligibility: 100,
        pacing: 100,
        style: 100,
        technical: 100,
      }),
    ).toBe(100)
    expect(
      compositeScore({
        intelligibility: 100,
        pacing: 0,
        style: 0,
        technical: 0,
      }),
    ).toBe(40)
  })

  it('drops a missing part and scales the rest up', () => {
    expect(
      compositeScore({
        intelligibility: 80,
        pacing: 80,
        style: null,
        technical: 80,
      }),
    ).toBe(80)
    expect(
      compositeScore({
        intelligibility: null,
        pacing: 60,
        style: 60,
        technical: 60,
      }),
    ).toBe(60)
  })

  it('turns judge answers into a score', () => {
    expect(styleScoreFromJudge(5, 5)).toBe(100)
    expect(styleScoreFromJudge(1, 1)).toBe(0)
    expect(styleScoreFromJudge(3, 3)).toBe(50)
  })
})

describe('catalog', () => {
  it('only allows voices a model really has', () => {
    expect(comboProblem('gpt-4o-mini-tts', 'marin')).toBeNull()
    expect(comboProblem('tts-1-hd', 'marin')).not.toBeNull()
    expect(comboProblem('tts-1', 'nova')).toBeNull()
    expect(comboProblem('nope', 'marin')).not.toBeNull()
  })

  it('pins the language and keeps the style name out of the instructions', () => {
    const style = stylePreset('creator')
    if (!style) throw new Error('missing preset')
    const text = buildInstructions(style, th, 'Zebra Pen')
    expect(text).toContain('Speak Thai only. Do not switch languages.')
    expect(text).toContain('Pronunciation: Say the product name Zebra Pen')
    expect(text).not.toContain(style.label)
    expect(text.split('\n')[0]).toMatch(/^Voice Affect:/)
  })
})

describe('retry', () => {
  const rateLimited = Object.assign(new Error('slow down'), {
    status: 429,
    code: 'rate_limit_exceeded',
  })

  it('retries rate limits and honours Retry-After', () => {
    const withHeader = Object.assign(new Error('x'), {
      status: 429,
      headers: { get: () => '3' },
    })
    expect(retryDelayMs(withHeader, 0)).toBe(3000)
    expect(retryDelayMs(rateLimited, 0)).toBeGreaterThanOrEqual(500)
    expect(
      retryDelayMs(Object.assign(new Error('x'), { status: 503 }), 1),
    ).toBeGreaterThanOrEqual(1000)
  })

  it('never retries quota or other errors', () => {
    expect(
      retryDelayMs(
        Object.assign(new Error('x'), {
          status: 429,
          code: 'insufficient_quota',
        }),
        0,
      ),
    ).toBeNull()
    expect(
      retryDelayMs(Object.assign(new Error('x'), { status: 400 }), 0),
    ).toBeNull()
  })

  it('stops after the attempts are used', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw rateLimited
        },
        { attempts: 3, sleep: async () => undefined },
      ),
    ).rejects.toThrow('slow down')
    expect(calls).toBe(3)

    let ok = 0
    const result = await withRetry(
      async () => {
        ok++
        if (ok < 2) throw rateLimited
        return 'done'
      },
      { sleep: async () => undefined },
    )
    expect(result).toBe('done')
  })
})

describe('voice api', () => {
  let app: typeof import('@/app.js').default
  let dataDir: string

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'hm-voice-'))
    process.env.HOOK_MACHINE_DATA_DIR = dataDir
    process.env.HOOK_MACHINE_MOCK_AI = 'true'
    jest.resetModules()
    app = (await import('@/app.js')).default
  })

  it('lists options with the best model and voice as defaults', async () => {
    const response = await request(app).get('/api/hook-machine/voice/options')
    expect(response.status).toBe(200)
    expect(response.body.defaults).toEqual({
      language: 'en',
      model: 'gpt-4o-mini-tts',
      voice: 'marin',
      styles: expect.any(Array),
    })
    expect(response.body.defaults.styles).toHaveLength(4)
    expect(response.body.styles).toHaveLength(6)
    const best = response.body.models[0]
    expect(
      best.voices
        .filter((v: { recommended: boolean }) => v.recommended)
        .map((v: { id: string }) => v.id),
    ).toEqual(['marin', 'cedar'])
    expect(response.body.deprecation.shutdownDate).toBe('2027-01-06')
  })

  it('rejects a voice request for an unknown project', async () => {
    const response = await request(app)
      .post(
        '/api/hook-machine/projects/11111111-1111-4111-8111-111111111111/voice',
      )
      .send({})
    expect(response.status).toBe(404)
  })

  it('refuses audio for ids that are not real takes', async () => {
    const response = await request(app).get(
      '/api/hook-machine/projects/11111111-1111-4111-8111-111111111111/voice/takes/..%2F..%2Fetc%2Fpasswd/audio',
    )
    expect(response.status).toBe(404)
  })

  it('runs a demo voice job end to end and serves the audio', async () => {
    const { createDoc } = await import('@/services/hook-machine/store.js')
    const id = crypto.randomUUID()
    await createDoc('projects', {
      id,
      profileId: crypto.randomUUID(),
      title: 'Demo',
      createdAt: new Date().toISOString(),
      status: 'ready',
      step: null,
      error: null,
      mock: true,
      language: 'en',
      input: { notes: '', productUrl: null, durationSec: 20, images: [] },
      brief: {
        productName: 'Dry Fast Pen',
        category: 'pens',
        audience: 'students',
        keywords: [],
      },
      research: null,
      hooks: null,
      chosenHook: null,
      script: {
        title: 'Demo',
        totalSec: 20,
        caption: '',
        hashtags: [],
        beats: [
          {
            section: 'hook',
            startSec: 0,
            endSec: 3,
            voiceover: 'Under one hundred baht and I use it daily',
            imageIndex: null,
          },
          {
            section: 'cta',
            startSec: 3,
            endSec: 8,
            voiceover: 'Tap the basket below',
            imageIndex: null,
          },
        ],
      },
      review: null,
    } as never)

    const bad = await request(app)
      .post(`/api/hook-machine/projects/${id}/voice`)
      .send({ model: 'tts-1', voice: 'marin' })
    expect(bad.status).toBe(400)

    const started = await request(app)
      .post(`/api/hook-machine/projects/${id}/voice`)
      .send({ styles: ['creator', 'whisper'] })
    expect(started.status).toBe(202)
    expect(started.body.voice.takes).toHaveLength(2)

    let voice:
      | {
          status: string
          takes: {
            id: string
            status: string
            recommended: boolean
            scores: { total: number } | null
          }[]
        }
      | undefined
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 150))
      voice = (await request(app).get(`/api/hook-machine/projects/${id}`)).body
        .project.voice
      if (voice?.status !== 'running') break
    }
    expect(voice?.status).toBe('ready')
    expect(voice?.takes.every((t) => t.status === 'done' && t.scores)).toBe(
      true,
    )
    expect(voice?.takes.filter((t) => t.recommended)).toHaveLength(1)

    const takeId = voice?.takes[0]?.id ?? ''
    const audio = await request(app).get(
      `/api/hook-machine/projects/${id}/voice/takes/${takeId}/audio?download=1`,
    )
    expect(audio.status).toBe(200)
    expect(audio.headers['content-type']).toContain('audio/wav')
    expect(audio.headers['x-ai-generated-voice']).toBe('true')
    expect(audio.headers['content-disposition']).toContain('ai-voice.wav')
    expect(audio.headers['cross-origin-resource-policy']).toBe('cross-origin')

    const rated = await request(app)
      .post(`/api/hook-machine/projects/${id}/voice/takes/${takeId}/rating`)
      .send({ stars: 4 })
    expect(rated.status).toBe(200)
    expect(rated.body.project.voice.takes[0].userRating).toBe(4)
    expect(
      (
        await request(app)
          .post(`/api/hook-machine/projects/${id}/voice/takes/${takeId}/rating`)
          .send({ stars: 9 })
      ).status,
    ).toBe(422)
  })
})
