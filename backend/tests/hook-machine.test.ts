import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import request from 'supertest'

import { vttToText } from '@/services/hook-machine/collectors/ytdlp.js'
import {
  cleanDisplayDeep,
  cleanDisplayText,
  gradeRank,
  rubricPrompt,
  stripEmDash,
} from '@/services/hook-machine/rubric.js'
import { parsePublicUrl, parseSourceUrl } from '@/services/hook-machine/url.js'

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
    patch: (url: string) => agent.patch(url).set('Cookie', cookie),
  }
}

describe('source url validation', () => {
  it('detects the three supported platforms', () => {
    expect(
      parseSourceUrl('https://www.youtube.com/watch?v=abc')?.platform,
    ).toBe('youtube')
    expect(parseSourceUrl('https://youtu.be/abc')?.platform).toBe('youtube')
    expect(parseSourceUrl('https://vm.tiktok.com/xyz/')?.platform).toBe(
      'tiktok',
    )
    expect(
      parseSourceUrl('https://www.instagram.com/reel/abc/')?.platform,
    ).toBe('instagram')
  })

  it('rejects other hosts, look-alikes and non-http schemes', () => {
    expect(parseSourceUrl('https://example.com/a')).toBeNull()
    expect(parseSourceUrl('https://youtube.com.evil.io/a')).toBeNull()
    expect(parseSourceUrl('file:///etc/passwd')).toBeNull()
    expect(parseSourceUrl('not a url')).toBeNull()
  })

  it('only lets product pages point at public hosts', () => {
    expect(parsePublicUrl('https://shop.example.com/p/1')).toContain(
      'shop.example.com',
    )
    for (const bad of [
      'http://localhost:8080/health',
      'http://127.0.0.1/',
      'http://192.168.1.5/',
      'http://10.0.0.1/',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/',
      'http://intranet/',
      'ftp://example.com/',
    ]) {
      expect(parsePublicUrl(bad)).toBeNull()
    }
  })
})

describe('rubric helpers', () => {
  it('removes em-dashes from spoken hooks', () => {
    expect(stripEmDash('ถูก — แต่ดี')).toBe('ถูก, แต่ดี')
    expect(stripEmDash('no dash here')).toBe('no dash here')
  })

  it('ranks grades from best to worst', () => {
    expect(gradeRank('A+')).toBeLessThan(gradeRank('B+'))
    expect(gradeRank('B+')).toBeLessThan(gradeRank('F'))
  })

  it('puts profile principles into the grading prompt', () => {
    const prompt = rubricPrompt([
      {
        name: 'Number first',
        description: 'Open with a number',
        source: 'profile',
      },
    ])
    expect(prompt).toContain('Number first')
    expect(prompt).toContain('Rapid context')
  })
})

describe('vtt cleanup', () => {
  it('keeps spoken text and drops timing, tags and repeats', () => {
    const vtt = `WEBVTT
Kind: captions

00:00:00.000 --> 00:00:02.000
Hello <c>there</c>

00:00:02.000 --> 00:00:04.000
Hello there
second line`
    expect(vttToText(vtt)).toBe('Hello there\nsecond line')
  })
})

describe('hook machine api', () => {
  let app: typeof import('@/app.js').default

  beforeAll(async () => {
    process.env.HOOK_MACHINE_DATA_DIR = mkdtempSync(
      path.join(os.tmpdir(), 'hm-test-'),
    )
    process.env.HOOK_MACHINE_MOCK_AI = 'true'
    jest.resetModules()
    app = (await import('@/app.js')).default
  })

  it('creates a profile and rejects unsupported links', async () => {
    const created = await as(app)
      .post('/agent/hook-machine/profiles')
      .send({ name: 'Test', language: 'th' })
    expect(created.status).toBe(201)
    const id = created.body.profile.id as string

    const rejected = await as(app)
      .post(`/agent/hook-machine/profiles/${id}/sources`)
      .send({ urls: ['https://example.com/video'] })
    expect(rejected.status).toBe(400)

    const added = await as(app)
      .post(`/agent/hook-machine/profiles/${id}/sources`)
      .send({
        urls: [
          'https://youtu.be/abc',
          'https://youtu.be/abc',
          'http://localhost/x',
        ],
      })
    expect(added.status).toBe(201)
    expect(added.body.profile.sources).toHaveLength(1)
    expect(added.body.rejected).toEqual(['http://localhost/x'])
  })

  it('keeps every document private to its account', async () => {
    const created = await as(app)
      .post('/agent/hook-machine/profiles')
      .send({ name: 'Mine' })
    const profileId = created.body.profile.id as string
    const { createDoc } = await import('@/services/hook-machine/store.js')
    const projectId = crypto.randomUUID()
    await createDoc('projects', {
      id: projectId,
      ownerId: 'user-a',
      profileId,
      title: 'Private',
      createdAt: new Date().toISOString(),
      status: 'ready',
      step: null,
      error: null,
      mock: true,
      language: 'en',
      input: { notes: '', productUrl: null, durationSec: 20, images: [] },
      brief: null,
      research: null,
      hooks: null,
      chosenHook: null,
      script: null,
      review: null,
    } as never)
    const legacyId = crypto.randomUUID()
    await createDoc('profiles', {
      id: legacyId,
      name: 'Old',
      sources: [],
    } as never)

    const base = '/agent/hook-machine'
    const b = as(app, 'b')
    const a = as(app, 'a')
    const hidden = [
      b.get(`${base}/profiles/${profileId}`),
      b.patch(`${base}/profiles/${profileId}`).send({ name: 'Taken' }),
      b.delete(`${base}/profiles/${profileId}`),
      b.get(`${base}/voice/options?projectId=${projectId}`),
      b
        .post(`${base}/profiles/${profileId}/sources`)
        .send({ urls: ['https://youtu.be/abc'] }),
      b.delete(`${base}/profiles/${profileId}/sources/${crypto.randomUUID()}`),
      b.post(`${base}/profiles/${profileId}/analyze`),
      b.get(`${base}/profiles/${profileId}/projects`),
      b
        .post(`${base}/profiles/${profileId}/projects`)
        .send({ notes: 'stolen' }),
      b.get(`${base}/projects/${projectId}`),
      b.post(`${base}/projects/${projectId}/hook`).send({ hook: 'a hook' }),
      b.post(`${base}/projects/${projectId}/grade`).send({ hook: 'a hook' }),
      b.post(`${base}/projects/${projectId}/voice`).send({}),
      b
        .post(
          `${base}/projects/${projectId}/voice/takes/${crypto.randomUUID()}/rating`,
        )
        .send({ stars: 5 }),
      b.get(
        `${base}/projects/${projectId}/voice/takes/${crypto.randomUUID()}/audio`,
      ),
      // Documents saved before accounts existed belong to nobody.
      a.get(`${base}/profiles/${legacyId}`),
      b.get(`${base}/profiles/${legacyId}`),
    ]
    for (const response of await Promise.all(hidden)) {
      expect(response.status).toBe(404)
    }

    const listedByB = await b.get(`${base}/profiles`)
    expect(listedByB.body.profiles).toEqual([])
    const listedByA = await a.get(`${base}/profiles`)
    expect(listedByA.body.profiles.map((p: { id: string }) => p.id)).toContain(
      profileId,
    )
    expect((await a.get(`${base}/projects/${projectId}`)).status).toBe(200)
    // Nothing was written by the rejected requests.
    expect(
      (await a.get(`${base}/profiles/${profileId}`)).body.profile.sources,
    ).toHaveLength(0)
  })

  it('requires a signed-in account', async () => {
    expect(
      (await request(app).get('/agent/hook-machine/profiles')).status,
    ).toBe(401)
    expect(
      (
        await request(app)
          .post('/agent/hook-machine/profiles')
          .send({ name: 'x' })
      ).status,
    ).toBe(401)
    expect(
      (await request(app).get('/agent/hook-machine/voice/options')).status,
    ).toBe(401)
  })

  it('validates names and ids', async () => {
    expect(
      (await as(app).post('/agent/hook-machine/profiles').send({ name: '' }))
        .status,
    ).toBe(422)
    expect(
      (await as(app).get('/agent/hook-machine/profiles/not-a-uuid')).status,
    ).toBe(404)
  })

  it('will not start a project before the profile is analyzed', async () => {
    const { body } = await as(app)
      .post('/agent/hook-machine/profiles')
      .send({ name: 'Fresh' })
    const response = await as(app)
      .post(`/agent/hook-machine/profiles/${body.profile.id}/projects`)
      .send({ notes: 'a product' })
    expect(response.status).toBe(400)
  })

  describe('managing a style', () => {
    const base = '/agent/hook-machine'

    const makeProfile = async (extra: Record<string, unknown> = {}) => {
      const { createDoc } = await import('@/services/hook-machine/store.js')
      const id = crypto.randomUUID()
      await createDoc('profiles', {
        id,
        ownerId: 'user-a',
        name: 'Seed',
        language: 'th',
        createdAt: new Date().toISOString(),
        status: 'ready',
        step: null,
        error: null,
        mock: true,
        sources: [],
        insights: null,
        rubric: [],
        ...extra,
      } as never)
      return id
    }

    const makeProject = async (profileId: string, extra = {}) => {
      const { createDoc } = await import('@/services/hook-machine/store.js')
      const id = crypto.randomUUID()
      await createDoc('projects', {
        id,
        ownerId: 'user-a',
        profileId,
        title: 'Script',
        createdAt: new Date().toISOString(),
        status: 'ready',
        step: null,
        error: null,
        mock: true,
        language: 'th',
        input: { notes: '', productUrl: null, durationSec: 20, images: [] },
        brief: null,
        research: null,
        hooks: null,
        chosenHook: null,
        script: null,
        review: null,
        ...extra,
      } as never)
      return id
    }

    const source = (id: string, status: string) => ({
      id,
      url: `https://youtu.be/${id}`,
      platform: 'youtube',
      status,
      step: null,
      error: null,
      warnings: [],
      via: [],
      video: null,
      transcript: null,
      transcriptSource: null,
      pacing: null,
      analysis: null,
    })

    it('renames a style and validates the name', async () => {
      const id = await makeProfile()
      const a = as(app, 'a')
      const renamed = await a
        .patch(`${base}/profiles/${id}`)
        .send({ name: '  Review style  ' })
      expect(renamed.status).toBe(200)
      expect(renamed.body.profile.name).toBe('Review style')
      expect(
        (await a.patch(`${base}/profiles/${id}`).send({ name: '   ' })).status,
      ).toBe(422)
    })

    it('deletes a style with its scripts and audio, and only for its owner', async () => {
      const { readDoc } = await import('@/services/hook-machine/store.js')
      const id = await makeProfile()
      const projectId = await makeProject(id)
      const otherId = await makeProfile()
      const otherProject = await makeProject(otherId)
      const audioDir = path.join(
        process.env.HOOK_MACHINE_DATA_DIR as string,
        'audio',
        projectId,
      )
      const { mkdirSync, writeFileSync, existsSync } = await import('node:fs')
      mkdirSync(audioDir, { recursive: true })
      writeFileSync(path.join(audioDir, 'x.wav'), 'wav')

      expect((await as(app, 'b').delete(`${base}/profiles/${id}`)).status).toBe(
        404,
      )
      expect(await readDoc('profiles', id)).not.toBeNull()

      const removed = await as(app).delete(`${base}/profiles/${id}`)
      expect(removed.status).toBe(200)
      expect(removed.body.removedProjects).toBe(1)
      expect(await readDoc('profiles', id)).toBeNull()
      expect(await readDoc('projects', projectId)).toBeNull()
      expect(existsSync(audioDir)).toBe(false)
      // Another style of the same account is untouched.
      expect(await readDoc('profiles', otherId)).not.toBeNull()
      expect(await readDoc('projects', otherProject)).not.toBeNull()
      expect((await as(app).get(`${base}/profiles/${id}`)).status).toBe(404)
    })

    it('will not delete or edit sources while a job is running', async () => {
      const running = await makeProfile({
        status: 'running',
        sources: [source('aaa', 'running')],
      })
      const a = as(app)
      expect((await a.delete(`${base}/profiles/${running}`)).status).toBe(409)
      expect(
        (await a.delete(`${base}/profiles/${running}/sources/aaa`)).status,
      ).toBe(409)
      expect(
        (
          await a
            .post(`${base}/profiles/${running}/sources`)
            .send({ urls: ['https://youtu.be/bbb'] })
        ).status,
      ).toBe(409)

      const busyScript = await makeProfile()
      await makeProject(busyScript, { status: 'running' })
      expect((await a.delete(`${base}/profiles/${busyScript}`)).status).toBe(
        409,
      )
    })

    it('sends a style back to draft when a clip it was built from is removed', async () => {
      const insights = { styleSummary: 'x' }
      const id = await makeProfile({
        sources: [source('one', 'done'), source('two', 'done')],
        insights,
        rubric: [{ name: 'r', description: 'd', source: 'profile' }],
      })
      const a = as(app)
      const first = await a.delete(`${base}/profiles/${id}/sources/one`)
      expect(first.status).toBe(200)
      expect(first.body.profile.status).toBe('draft')
      expect(first.body.profile.insights).toEqual(insights)
      expect(first.body.profile.sources).toHaveLength(1)

      const last = await a.delete(`${base}/profiles/${id}/sources/two`)
      expect(last.body.profile.sources).toHaveLength(0)
      expect(last.body.profile.insights).toBeNull()
      expect(last.body.profile.rubric).toEqual([])
      // A style with no clips cannot be analysed.
      expect((await a.post(`${base}/profiles/${id}/analyze`)).status).toBe(400)
    })

    it('keeps a style ready when a clip that never finished is removed', async () => {
      const id = await makeProfile({
        sources: [source('ok', 'done'), source('bad', 'error')],
        insights: { styleSummary: 'x' },
      })
      const response = await as(app).delete(
        `${base}/profiles/${id}/sources/bad`,
      )
      expect(response.body.profile.status).toBe('ready')
    })

    it('suggests delivery styles from the style voice, only for the owner', async () => {
      const id = await makeProfile({
        insights: {
          voice: {
            tone: 'สดใส สนุก พูดเร็ว',
            persona: 'ครีเอเตอร์',
            sentenceStyle: 'สั้น',
            vocabulary: [],
          },
        },
      })
      const projectId = await makeProject(id)
      const a = as(app)
      const withProject = await a.get(
        `${base}/voice/options?projectId=${projectId}`,
      )
      expect(withProject.status).toBe(200)
      expect(withProject.body.suggested.styles[0]).toBe('creator')
      expect(withProject.body.suggested.styles.length).toBeLessThanOrEqual(4)

      const plain = await a.get(`${base}/voice/options`)
      expect(plain.body.suggested).toBeNull()
      expect((await a.get(`${base}/voice/options?projectId=nope`)).status).toBe(
        422,
      )
    })
  })
})

describe('display text cleanup', () => {
  it('removes curly and angle quotes and dashes from model text', () => {
    expect(
      cleanDisplayText('ฉลากเขียนว่า \u201cDAILY GLOW\u201d \u00abดี\u00bb'),
    ).toBe('ฉลากเขียนว่า DAILY GLOW ดี')
    expect(cleanDisplayText('ช่วง 0\u20131 วินาที')).toBe('ช่วง 0 ถึง 1 วินาที')
    expect(cleanDisplayText('เร็ว \u2014 แต่ชัด')).toBe('เร็ว, แต่ชัด')
    expect(cleanDisplayText('it\u2019s ok')).toBe("it's ok")
  })

  it('cleans every string inside nested data and leaves other values alone', () => {
    const value = {
      a: ['\u201cx\u201d', 3],
      b: { c: 'y\u2014z', d: null, e: true },
    }
    expect(cleanDisplayDeep(value)).toEqual({
      a: ['x', 3],
      b: { c: 'y, z', d: null, e: true },
    })
  })
})
