import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import request from 'supertest'

// Three throwaway accounts, told apart by the first character of the session cookie.
jest.mock('@/services/auth.service.js', () => {
  const { AppError } = jest.requireActual('@/services/error.service.js')
  const users: Record<string, { id: string; email: string }> = {
    a: { id: 'user-a', email: 'a@example.test' },
    b: { id: 'user-b', email: 'b@example.test' },
    c: { id: 'user-c', email: 'c@example.test' },
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

type Who = 'a' | 'b' | 'c'
const BASE = '/agent/hook-machine'
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('video job helpers', () => {
  it('pairs spoken lines with the beats they came from', async () => {
    const { alignSpokenToBeats, dataUrlBuffer } = await import(
      '@/services/video-job/job.js'
    )
    const beats = [
      { voiceover: 'a', imageIndex: 0 },
      { voiceover: ' ', imageIndex: 3 },
      { voiceover: 'b', imageIndex: 1 },
    ]
    // Same count as the non empty beats: one to one.
    expect(alignSpokenToBeats(beats, ['x', 'y'])).toEqual([
      { text: 'x', imageIndex: 0 },
      { text: 'y', imageIndex: 1 },
    ])
    // More lines than beats: lines are merged into the beats in order.
    expect(alignSpokenToBeats(beats, ['1', '2', '3', '4'])).toEqual([
      { text: '1 2', imageIndex: 0 },
      { text: '3 4', imageIndex: 1 },
    ])
    // Fewer lines than beats: nothing is invented.
    expect(alignSpokenToBeats(beats, ['only'])).toEqual([
      { text: 'only', imageIndex: 0 },
    ])
    expect(alignSpokenToBeats(beats, [])).toEqual([])
    expect(alignSpokenToBeats([], ['x'])).toEqual([
      { text: 'x', imageIndex: null },
    ])

    expect(dataUrlBuffer(TINY_PNG)?.length).toBeGreaterThan(10)
    expect(dataUrlBuffer('data:text/plain;base64,AAAA')).toBeNull()
    expect(dataUrlBuffer('data:image/png;base64,')).toBeNull()
  })

  it('builds folder paths only from valid ids', async () => {
    const { videoDir, videoFilePath } = await import(
      '@/services/video-job/job.js'
    )
    expect(videoDir('../../etc')).toBeNull()
    expect(videoFilePath('nope')).toBeNull()
    expect(videoFilePath(crypto.randomUUID())).toMatch(/final\.mp4$/)
  })

  it('maps every failure to a stable code and a Thai sentence', async () => {
    const { classifyError, VIDEO_ERRORS, VideoJobError } = await import(
      '@/services/video-job/errors.js'
    )
    expect(classifyError({ status: 429 }, 'voice').code).toBe('ai_busy')
    expect(classifyError({ code: 'insufficient_quota' }, 'script').code).toBe(
      'ai_busy',
    )
    expect(classifyError({ status: 401 }, 'script').code).toBe('ai_unavailable')
    expect(classifyError(new Error('x'), 'voice').code).toBe('voice_failed')
    expect(classifyError(new Error('x'), 'compose').code).toBe('compose_failed')
    expect(classifyError(new Error('x'), 'hooks').code).toBe('script_failed')
    expect(classifyError(new Error('x'), null).code).toBe('unknown')
    expect(
      classifyError(new VideoJobError('timeout', 'slow'), 'compose').code,
    ).toBe('timeout')

    // The message is always one of the fixed Thai sentences, never the raw error.
    const secret = new Error('ENOENT /Users/someone/secret.wav at stack line 9')
    const mapped = classifyError(secret, 'compose')
    expect(Object.values(VIDEO_ERRORS)).toContain(mapped.messageTH)
    expect(mapped.messageTH).not.toMatch(/secret|ENOENT|stack/)
    for (const message of Object.values(VIDEO_ERRORS)) {
      expect(message).toMatch(/[฀-๿]/)
    }
  })

  it('keeps the language list in step with the voice catalog', async () => {
    const { VOICE_LANGUAGES } = await import('@/services/video-job/types.js')
    const { LANGUAGES } = await import(
      '@/services/hook-machine/voice/catalog.js'
    )
    expect([...VOICE_LANGUAGES].sort()).toEqual(
      LANGUAGES.map((l) => l.code).sort(),
    )
  })
})

describe('one button video api', () => {
  let app: typeof import('@/app.js').default
  let composerModule: typeof import('@/services/video-job/composer.js')
  let jobModule: typeof import('@/services/video-job/job.js')
  let store: typeof import('@/services/hook-machine/store.js')
  let dataDir: string
  let composeCalls: {
    beats: unknown
    images: number
    title?: string
    aspect: string
    width: number
    height: number
  }[] = []

  const as = (who: Who = 'a') => {
    const agent = request(app)
    const cookie = `so_session=${who.repeat(43)}`
    return {
      get: (url: string) => agent.get(url).set('Cookie', cookie),
      post: (url: string) => agent.post(url).set('Cookie', cookie),
      delete: (url: string) => agent.delete(url).set('Cookie', cookie),
    }
  }

  /** A style that is ready to use, owned by one account. */
  async function readyProfile(
    ownerId: string,
    status: 'ready' | 'draft' = 'ready',
  ) {
    const { mockFor } = await import('@/services/hook-machine/mock-ai.js')
    const insights = mockFor('profile_insights') as {
      hookFormats: object[]
    }
    const id = crypto.randomUUID()
    await store.createDoc('profiles', {
      id,
      ownerId,
      name: 'Test style',
      language: 'th',
      createdAt: new Date().toISOString(),
      status,
      step: null,
      error: null,
      mock: true,
      sources: [],
      insights:
        status === 'ready'
          ? {
              ...insights,
              hookFormats: insights.hookFormats.map((f) => ({
                ...f,
                sourceId: null,
              })),
            }
          : null,
      rubric: [],
    } as never)
    return id
  }

  /** Composer that writes a small file, or waits until the test lets it finish. */
  function installComposer(mode: 'now' | 'hold' | 'fail' = 'now') {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    composerModule.setComposerForTests(async (req) => {
      composeCalls.push({
        beats: req.beats,
        images: req.images.length,
        title: req.title,
        aspect: req.aspect,
        width: req.width,
        height: req.height,
      })
      if (mode === 'fail')
        throw new Error('ffmpeg exploded at /Users/someone/secret.wav')
      if (mode === 'hold') await gate
      await mkdir(path.dirname(req.outPath), { recursive: true })
      await writeFile(req.outPath, Buffer.alloc(5000, 7))
      return { path: req.outPath, durationSec: 12.5 }
    })
    return release
  }

  async function waitFor(
    who: Who,
    id: string,
    until: (video: { status: string; step: string | null }) => boolean,
    ms = 15_000,
  ) {
    const started = Date.now()
    for (;;) {
      const res = await as(who).get(`${BASE}/videos/${id}`)
      if (until(res.body.video)) return res.body.video
      if (Date.now() - started > ms) throw new Error('timed out waiting')
      await sleep(40)
    }
  }
  const finished = (who: Who, id: string) =>
    waitFor(who, id, (v) => v.status !== 'running')

  const create = (who: Who, profileId: string, extra: object = {}) =>
    as(who)
      .post(`${BASE}/videos`)
      .send({
        profileId,
        brief: 'ปากกาเจลหมึกแห้งไว',
        images: [TINY_PNG],
        durationSec: 30,
        ...extra,
      })

  beforeAll(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'vj-test-'))
    process.env.HOOK_MACHINE_DATA_DIR = dataDir
    process.env.HOOK_MACHINE_MOCK_AI = 'true'
    // This file starts far more jobs than one account would in 15 minutes.
    process.env.HOOK_MACHINE_EXPENSIVE_LIMIT = '1000'
    jest.resetModules()
    app = (await import('@/app.js')).default
    composerModule = await import('@/services/video-job/composer.js')
    jobModule = await import('@/services/video-job/job.js')
    store = await import('@/services/hook-machine/store.js')
  })

  beforeEach(() => {
    composeCalls = []
    delete process.env.VIDEO_JOB_TIMEOUT_MS
    delete process.env.VIDEO_JOB_KEEP
    installComposer('now')
  })

  afterAll(() => {
    composerModule.setComposerForTests(null)
  })

  it('rejects bad requests before any work starts', async () => {
    const profileId = await readyProfile('user-a')

    expect((await create('a', 'not-a-uuid')).status).toBe(422)
    expect((await create('a', profileId, { durationSec: 20 })).status).toBe(422)
    expect(
      (await create('a', profileId, { images: Array(5).fill(TINY_PNG) }))
        .status,
    ).toBe(422)
    expect(
      (await create('a', profileId, { voice: { language: 'xx' } })).status,
    ).toBe(422)
    expect(
      (await create('a', profileId, { brief: 'x'.repeat(4001) })).status,
    ).toBe(422)

    const empty = await create('a', profileId, { brief: '   ', images: [] })
    expect(empty.status).toBe(400)
    expect(empty.body.key).toBe('so-video-job-empty-video')

    const badLink = await create('a', profileId, {
      productUrl: 'http://localhost:8080/x',
    })
    expect(badLink.status).toBe(400)

    const combo = await create('a', profileId, {
      voice: { model: 'tts-1', voice: 'marin' },
    })
    expect(combo.status).toBe(400)
    expect(combo.body.key).toBe('so-video-job-voice-combo')

    const draft = await readyProfile('user-a', 'draft')
    const notReady = await create('a', draft)
    expect(notReady.status).toBe(400)
    expect(notReady.body.key).toBe('so-video-job-profile-not-ready')

    // Nothing above started a job.
    expect((await as('a').get(`${BASE}/videos`)).body.videos).toEqual([])
    expect(composeCalls).toHaveLength(0)
  })

  it('needs a login', async () => {
    const res = await request(app).get(`${BASE}/videos`)
    expect(res.status).toBe(401)
  })

  it('goes through the six steps and serves the finished clip', async () => {
    const profileId = await readyProfile('user-a')
    const started = await create('a', profileId, {
      voice: { language: 'en' },
    })
    expect(started.status).toBe(202)
    expect(started.body.video).toMatchObject({
      status: 'running',
      stepCount: 6,
      error: null,
      file: null,
      durationSec: 30,
      voiceLanguage: 'en',
      profileId,
    })
    expect(started.body.video.stepIndex).toBeGreaterThanOrEqual(1)
    const id = started.body.video.id as string

    const done = await finished('a', id)
    expect(done).toMatchObject({
      status: 'ready',
      step: null,
      stepIndex: 6,
      stepCount: 6,
      error: null,
      file: {
        url: `${BASE}/videos/${id}/file`,
        sizeBytes: 5000,
        durationSec: 12.5,
      },
    })
    expect(Object.keys(done).sort()).toEqual(
      [
        'aspect',
        'createdAt',
        'durationSec',
        'height',
        'width',
        'error',
        'file',
        'id',
        'profileId',
        'status',
        'step',
        'stepCount',
        'stepIndex',
        'voiceLanguage',
      ].sort(),
    )

    // Every step was entered once, in order.
    const doc = await store.readDoc<{ trail: string[]; projectId: string }>(
      'videos',
      id,
    )
    expect(doc?.trail).toEqual([
      'brief',
      'research',
      'hooks',
      'script',
      'voice',
      'compose',
    ])

    // The composer got the spoken words, the photo and the product name.
    expect(composeCalls).toHaveLength(1)
    expect(composeCalls[0]?.images).toBe(1)
    expect(composeCalls[0]?.title).toBeTruthy()
    expect(Array.isArray(composeCalls[0]?.beats)).toBe(true)
    // Only the finished clip stays on disk.
    expect(existsSync(path.join(dataDir, 'videos', id, 'final.mp4'))).toBe(true)
    expect(existsSync(path.join(dataDir, 'videos', id, 'voice.wav'))).toBe(
      false,
    )
    expect(existsSync(path.join(dataDir, 'videos', id, 'render.mp4'))).toBe(
      false,
    )

    // The script lives in a normal project of the same account.
    const project = await store.readDoc<{ ownerId: string; status: string }>(
      'projects',
      doc?.projectId ?? '',
    )
    expect(project).toMatchObject({ ownerId: 'user-a', status: 'ready' })

    const list = await as('a').get(`${BASE}/videos`)
    expect(list.body.videos[0].id).toBe(id)
  })

  it('serves the file with ranges and marks the voice as AI generated', async () => {
    const profileId = await readyProfile('user-a')
    const id = (await create('a', profileId)).body.video.id as string
    await finished('a', id)

    const binary = (
      res: import('http').IncomingMessage,
      cb: (e: Error | null, b: Buffer) => void,
    ) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => cb(null, Buffer.concat(chunks)))
    }

    const full = await as('a')
      .get(`${BASE}/videos/${id}/file`)
      .buffer(true)
      .parse(binary as never)
    expect(full.status).toBe(200)
    expect(full.headers['content-type']).toBe('video/mp4')
    expect(full.headers['x-ai-generated-voice']).toBe('true')
    expect(full.headers['accept-ranges']).toBe('bytes')
    expect(full.headers['content-disposition']).toBe(
      `inline; filename="livecut-${id.slice(0, 8)}-ai-voice.mp4"`,
    )
    expect(full.body.length).toBe(5000)

    const part = await as('a')
      .get(`${BASE}/videos/${id}/file`)
      .set('Range', 'bytes=10-19')
      .buffer(true)
      .parse(binary as never)
    expect(part.status).toBe(206)
    expect(part.headers['content-range']).toBe('bytes 10-19/5000')
    expect(part.body.length).toBe(10)

    const tail = await as('a')
      .get(`${BASE}/videos/${id}/file`)
      .set('Range', 'bytes=4990-')
      .buffer(true)
      .parse(binary as never)
    expect(tail.status).toBe(206)
    expect(tail.body.length).toBe(10)

    const beyond = await as('a')
      .get(`${BASE}/videos/${id}/file`)
      .set('Range', 'bytes=9000-9100')
    expect(beyond.status).toBe(416)

    const download = await as('a').get(`${BASE}/videos/${id}/file?download=1`)
    expect(download.headers['content-disposition']).toMatch(/^attachment;/)
  })

  it('keeps every video private to its account', async () => {
    const profileId = await readyProfile('user-a')
    const id = (await create('a', profileId)).body.video.id as string
    await finished('a', id)

    // Another account cannot read, download or delete it, and cannot use the style.
    const b = as('b')
    expect((await b.get(`${BASE}/videos/${id}`)).status).toBe(404)
    expect((await b.get(`${BASE}/videos/${id}/file`)).status).toBe(404)
    expect((await b.delete(`${BASE}/videos/${id}`)).status).toBe(404)
    expect((await create('b', profileId)).status).toBe(404)
    expect((await b.get(`${BASE}/videos`)).body.videos).toEqual([])

    // The owner still has everything.
    expect((await as('a').get(`${BASE}/videos/${id}`)).status).toBe(200)
    expect((await as('a').get(`${BASE}/videos/${id}/file`)).status).toBe(200)
    expect(
      (await as('a').get(`${BASE}/videos`)).body.videos.map(
        (v: { id: string }) => v.id,
      ),
    ).toContain(id)
  })

  it('allows one running video per account and hides the file until it is ready', async () => {
    const release = installComposer('hold')
    const profileId = await readyProfile('user-a')
    const first = await create('a', profileId)
    const id = first.body.video.id as string

    const second = await create('a', profileId)
    expect(second.status).toBe(409)
    expect(second.body.message_TH).toMatch(/[฀-๿]/)

    await waitFor('a', id, (v) => v.step === 'compose')
    const running = await as('a').get(`${BASE}/videos/${id}`)
    expect(running.body.video).toMatchObject({
      status: 'running',
      step: 'compose',
      stepIndex: 6,
      file: null,
    })
    expect((await as('a').get(`${BASE}/videos/${id}/file`)).status).toBe(404)
    expect((await as('a').delete(`${BASE}/videos/${id}`)).status).toBe(409)

    release()
    await finished('a', id)
    // A new one is allowed once the first has finished.
    const again = await create('a', profileId)
    expect(again.status).toBe(202)
    await finished('a', again.body.video.id)
  })

  it('refuses a third job at once with a Thai message and recovers afterwards', async () => {
    const release = installComposer('hold')
    const pa = await readyProfile('user-a')
    const pb = await readyProfile('user-b')
    const pc = await readyProfile('user-c')

    const a = await create('a', pa)
    const b = await create('b', pb)
    expect(a.status).toBe(202)
    expect(b.status).toBe(202)
    expect(jobModule.activeJobCount()).toBe(2)

    const c = await create('c', pc)
    expect(c.status).toBe(503)
    expect(c.body.message_TH).toMatch(/[฀-๿]/)
    expect(c.body.key).toBe('so-video-job-capacity')

    release()
    await finished('a', a.body.video.id)
    await finished('b', b.body.video.id)
    expect(jobModule.activeJobCount()).toBe(0)
    const retry = await create('c', pc)
    expect(retry.status).toBe(202)
    await finished('c', retry.body.video.id)
  })

  it('turns a failing composer into a short Thai message and leaves no files', async () => {
    installComposer('fail')
    const profileId = await readyProfile('user-a')
    const id = (await create('a', profileId)).body.video.id as string
    const done = await finished('a', id)

    expect(done.status).toBe('error')
    expect(done.file).toBeNull()
    expect(done.error).toBe(
      (await import('@/services/video-job/errors.js')).VIDEO_ERRORS
        .compose_failed,
    )
    expect(JSON.stringify(done)).not.toMatch(/ffmpeg|secret|\/Users/)
    expect(existsSync(path.join(dataDir, 'videos', id))).toBe(false)
    const doc = await store.readDoc<{ errorCode: string }>('videos', id)
    expect(doc?.errorCode).toBe('compose_failed')
  })

  it('reports a script failure and a bad voice with the right code', async () => {
    const { startVideoJob } = await import('@/services/video-job/job.js')
    const profile = JSON.parse(
      JSON.stringify(
        await store.readDoc('profiles', await readyProfile('user-a')),
      ),
    )

    // The style is not on disk, so the script pipeline cannot load it.
    const ghost = { ...profile, id: crypto.randomUUID() }
    const lost = await startVideoJob({
      ownerId: 'user-a',
      profile: ghost,
      brief: 'x',
      images: [],
      productUrl: null,
      durationSec: 30,
      voice: { language: 'en', model: 'gpt-4o-mini-tts', voice: 'marin' },
    })
    const lostDone = await finished('a', lost.id)
    expect(lostDone.status).toBe('error')
    expect(
      (await store.readDoc<{ errorCode: string }>('videos', lost.id))
        ?.errorCode,
    ).toBe('script_failed')

    const broken = await startVideoJob({
      ownerId: 'user-a',
      profile,
      brief: 'x',
      images: [],
      productUrl: null,
      durationSec: 30,
      voice: { language: 'en', model: 'not-a-model', voice: 'marin' },
    })
    await finished('a', broken.id)
    const doc = await store.readDoc<{ errorCode: string; trail: string[] }>(
      'videos',
      broken.id,
    )
    expect(doc?.errorCode).toBe('voice_failed')
    expect(doc?.trail).toContain('voice')
    expect(doc?.trail).not.toContain('compose')
  })

  it('makes any of the four shapes, 9:16 by default, at the demo size', async () => {
    const { frameSize } = await import('@/services/compose/presets.js')
    const profileId = await readyProfile('user-a')

    // An old client sends no aspect and keeps getting 9:16.
    const plain = await create('a', profileId)
    expect(plain.status).toBe(202)
    expect(plain.body.video).toMatchObject({
      aspect: '9:16',
      width: 360,
      height: 640,
    })
    await finished('a', plain.body.video.id)
    expect(composeCalls[0]).toMatchObject({
      aspect: '9:16',
      width: 360,
      height: 640,
    })

    const expected: Record<string, [number, number]> = {
      '9:16': [360, 640],
      '4:5': [360, 450],
      '1:1': [360, 360],
      '16:9': [640, 360],
    }
    for (const [aspect, [width, height]] of Object.entries(expected)) {
      composeCalls = []
      const res = await create('a', profileId, { aspect })
      expect(res.status).toBe(202)
      expect(res.body.video).toMatchObject({ aspect, width, height })
      expect(frameSize(aspect as never, true)).toEqual({ width, height })
      const done = await finished('a', res.body.video.id)
      expect(done).toMatchObject({ status: 'ready', aspect, width, height })
      // The composer was asked for exactly that shape and size.
      expect(composeCalls[0]).toMatchObject({ aspect, width, height })
      const listed = (await as('a').get(`${BASE}/videos`)).body.videos.find(
        (v: { id: string }) => v.id === res.body.video.id,
      )
      expect(listed).toMatchObject({ aspect, width, height })
    }
  })

  it('rejects an unknown shape like any other bad field', async () => {
    const profileId = await readyProfile('user-a')
    for (const aspect of ['4:3', '21:9', 'portrait', '', 169, null]) {
      const res = await create('a', profileId, { aspect })
      expect(res.status).toBe(422)
    }
    expect(composeCalls).toHaveLength(0)
  })

  it('reads a job saved before the shapes existed as 9:16', async () => {
    const id = crypto.randomUUID()
    await store.createDoc('videos', {
      id,
      ownerId: 'user-a',
      profileId: crypto.randomUUID(),
      projectId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      durationSec: 30,
      voiceLanguage: 'en',
      voice: { model: 'm', voice: 'v', styleId: 'creator' },
      status: 'error',
      step: null,
      stepIndex: 3,
      errorCode: 'unknown',
      error: 'x',
      file: null,
      mock: false,
      trail: [],
    } as never)
    const res = await as('a').get(`${BASE}/videos/${id}`)
    expect(res.body.video).toMatchObject({
      aspect: '9:16',
      width: 1080,
      height: 1920,
    })
  })

  it('draws a plain card when only text was given', async () => {
    const profileId = await readyProfile('user-a')
    const res = await as('a')
      .post(`${BASE}/videos`)
      .send({ profileId, brief: 'text only', durationSec: 15 })
    expect(res.status).toBe(202)
    await finished('a', res.body.video.id)
    // The composer needs a photo, so one placeholder card is made.
    expect(composeCalls[0]?.images).toBe(1)
  })

  it('stops a job that runs too long, frees its slot and cleans up', async () => {
    process.env.VIDEO_JOB_TIMEOUT_MS = '400'
    const release = installComposer('hold')
    const profileId = await readyProfile('user-a')
    const id = (await create('a', profileId)).body.video.id as string

    const done = await finished('a', id)
    expect(done.status).toBe('error')
    const doc = await store.readDoc<{ errorCode: string }>('videos', id)
    expect(doc?.errorCode).toBe('timeout')
    // The slot is free again even though the composer is still hanging.
    expect(jobModule.activeJobCount()).toBe(0)

    // When the stuck work finally returns, its files are thrown away.
    release()
    for (let i = 0; i < 50 && existsSync(path.join(dataDir, 'videos', id)); i++)
      await sleep(40)
    expect(existsSync(path.join(dataDir, 'videos', id))).toBe(false)
    const after = await as('a').get(`${BASE}/videos/${id}`)
    expect(after.body.video.status).toBe('error')
    expect(after.body.video.file).toBeNull()
  })

  it('deletes a video with its files and its script', async () => {
    const profileId = await readyProfile('user-a')
    const id = (await create('a', profileId)).body.video.id as string
    await finished('a', id)
    const doc = await store.readDoc<{ projectId: string }>('videos', id)

    const res = await as('a').delete(`${BASE}/videos/${id}`)
    expect(res.status).toBe(200)
    expect(existsSync(path.join(dataDir, 'videos', id))).toBe(false)
    expect(await store.readDoc('videos', id)).toBeNull()
    expect(await store.readDoc('projects', doc?.projectId ?? '')).toBeNull()
    expect((await as('a').get(`${BASE}/videos/${id}`)).status).toBe(404)
  })

  it('keeps only the newest finished videos of an account', async () => {
    process.env.VIDEO_JOB_KEEP = '3'
    const owner = 'user-prune'
    const other = 'user-other'
    const make = async (who: string, minutes: number, status: string) => {
      const id = crypto.randomUUID()
      const projectId = crypto.randomUUID()
      await store.createDoc('projects', {
        id: projectId,
        ownerId: who,
      } as never)
      await store.createDoc('videos', {
        id,
        ownerId: who,
        profileId: crypto.randomUUID(),
        projectId,
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, minutes)).toISOString(),
        durationSec: 30,
        voiceLanguage: 'en',
        voice: { model: 'm', voice: 'v', styleId: 'creator' },
        status,
        step: null,
        stepIndex: 6,
        errorCode: null,
        error: null,
        file: { sizeBytes: 1, durationSec: 1 },
        mock: true,
        trail: [],
      } as never)
      await mkdir(path.join(dataDir, 'videos', id), { recursive: true })
      await writeFile(path.join(dataDir, 'videos', id, 'final.mp4'), 'x')
      return { id, projectId }
    }

    const mine = []
    for (let i = 1; i <= 5; i++)
      mine.push(await make(owner, i, i === 2 ? 'error' : 'ready'))
    const running = await make(owner, 0, 'running')
    const theirs = await make(other, 1, 'ready')

    expect(await jobModule.pruneOldVideos(owner)).toBe(2)

    // The two oldest finished ones are gone with their files and scripts.
    for (const gone of [mine[0], mine[1]]) {
      expect(await store.readDoc('videos', gone?.id ?? '')).toBeNull()
      expect(await store.readDoc('projects', gone?.projectId ?? '')).toBeNull()
      expect(existsSync(path.join(dataDir, 'videos', gone?.id ?? ''))).toBe(
        false,
      )
    }
    // The newest three, the running job and the other account are untouched.
    for (const kept of [mine[2], mine[3], mine[4], running, theirs]) {
      expect(await store.readDoc('videos', kept?.id ?? '')).not.toBeNull()
      expect(existsSync(path.join(dataDir, 'videos', kept?.id ?? ''))).toBe(
        true,
      )
    }
  })

  it('marks jobs cut off by a restart as failed and removes half written files', async () => {
    const id = crypto.randomUUID()
    const projectId = crypto.randomUUID()
    await store.createDoc('projects', {
      id: projectId,
      ownerId: 'user-a',
      status: 'running',
      step: 'x',
      error: null,
    } as never)
    await store.createDoc('videos', {
      id,
      ownerId: 'user-a',
      profileId: crypto.randomUUID(),
      projectId,
      createdAt: new Date().toISOString(),
      durationSec: 30,
      voiceLanguage: 'en',
      voice: { model: 'm', voice: 'v', styleId: 'creator' },
      status: 'running',
      step: 'compose',
      stepIndex: 6,
      errorCode: null,
      error: null,
      file: null,
      mock: true,
      trail: ['compose'],
    } as never)
    await mkdir(path.join(dataDir, 'videos', id), { recursive: true })
    await writeFile(path.join(dataDir, 'videos', id, 'render.mp4'), 'half')

    const { recoverInterruptedJobs } = await import(
      '@/services/hook-machine/recover.js'
    )
    await recoverInterruptedJobs()

    const res = await as('a').get(`${BASE}/videos/${id}`)
    expect(res.body.video.status).toBe('error')
    expect(res.body.video.error).toMatch(/รีสตาร์ท/)
    expect(res.body.video.file).toBeNull()
    expect(existsSync(path.join(dataDir, 'videos', id))).toBe(false)
    const doc = await store.readDoc<{ errorCode: string }>('videos', id)
    expect(doc?.errorCode).toBe('restart')
    // The script project of that job was recovered by the existing rule too.
    const project = await store.readDoc<{ status: string }>(
      'projects',
      projectId,
    )
    expect(project?.status).toBe('error')
  })
})

describe('one button video with the real composer', () => {
  const ffmpegPresent = [
    '/opt/homebrew/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
    '/usr/bin/ffmpeg',
  ].some(existsSync)
  const run = ffmpegPresent ? it : it.skip

  run(
    'renders a small demo clip with voice and captions in demo mode',
    async () => {
      const dataDir = mkdtempSync(path.join(os.tmpdir(), 'vj-real-'))
      process.env.HOOK_MACHINE_DATA_DIR = dataDir
      process.env.HOOK_MACHINE_MOCK_AI = 'true'
      jest.resetModules()
      const app = (await import('@/app.js')).default
      const store = await import('@/services/hook-machine/store.js')
      const { mockFor } = await import('@/services/hook-machine/mock-ai.js')
      ;(await import('@/services/video-job/composer.js')).setComposerForTests(
        null,
      )

      const insights = mockFor('profile_insights') as { hookFormats: object[] }
      const profileId = crypto.randomUUID()
      await store.createDoc('profiles', {
        id: profileId,
        ownerId: 'user-a',
        name: 'Real',
        language: 'th',
        createdAt: new Date().toISOString(),
        status: 'ready',
        step: null,
        error: null,
        mock: true,
        sources: [],
        insights: {
          ...insights,
          hookFormats: insights.hookFormats.map((f) => ({
            ...f,
            sourceId: null,
          })),
        },
        rubric: [],
      } as never)

      const cookie = `so_session=${'a'.repeat(43)}`
      const started = await request(app)
        .post(`${BASE}/videos`)
        .set('Cookie', cookie)
        .send({
          profileId,
          brief: 'ปากกาเจลหมึกแห้งไว',
          images: [TINY_PNG],
          durationSec: 15,
          voice: { language: 'th' },
        })
      expect(started.status).toBe(202)
      const id = started.body.video.id as string

      let video:
        | {
            status: string
            error: string | null
            file: { sizeBytes: number; durationSec: number } | null
          }
        | undefined
      const begun = Date.now()
      while (Date.now() - begun < 100_000) {
        const res = await request(app)
          .get(`${BASE}/videos/${id}`)
          .set('Cookie', cookie)
        video = res.body.video
        if (video?.status !== 'running') break
        await sleep(300)
      }
      expect(video?.error).toBeNull()
      expect(video?.status).toBe('ready')
      expect(video?.file?.sizeBytes).toBeGreaterThan(1000)

      const file = path.join(dataDir, 'videos', id, 'final.mp4')
      const probe = await new Promise<string>((resolve, reject) => {
        execFile(
          '/opt/homebrew/bin/ffprobe',
          [
            '-v',
            'error',
            '-show_entries',
            'stream=codec_name,codec_type,duration',
            '-of',
            'csv=p=0',
            file,
          ],
          (error, stdout) => (error ? reject(error) : resolve(stdout)),
        )
      }).catch(() => '')
      if (probe) {
        expect(probe).toMatch(/h264,video/)
        expect(probe).toMatch(/aac,audio/)
      }
    },
    120_000,
  )
})
