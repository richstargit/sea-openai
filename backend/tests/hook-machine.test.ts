import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import request from 'supertest'

import { vttToText } from '@/services/hook-machine/collectors/ytdlp.js'
import {
  gradeRank,
  rubricPrompt,
  stripEmDash,
} from '@/services/hook-machine/rubric.js'
import { parsePublicUrl, parseSourceUrl } from '@/services/hook-machine/url.js'

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
    const created = await request(app)
      .post('/api/hook-machine/profiles')
      .send({ name: 'Test', language: 'th' })
    expect(created.status).toBe(201)
    const id = created.body.profile.id as string

    const rejected = await request(app)
      .post(`/api/hook-machine/profiles/${id}/sources`)
      .send({ urls: ['https://example.com/video'] })
    expect(rejected.status).toBe(400)

    const added = await request(app)
      .post(`/api/hook-machine/profiles/${id}/sources`)
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

  it('validates names and ids', async () => {
    expect(
      (await request(app).post('/api/hook-machine/profiles').send({ name: '' }))
        .status,
    ).toBe(422)
    expect(
      (await request(app).get('/api/hook-machine/profiles/not-a-uuid')).status,
    ).toBe(404)
  })

  it('will not start a project before the profile is analyzed', async () => {
    const { body } = await request(app)
      .post('/api/hook-machine/profiles')
      .send({ name: 'Fresh' })
    const response = await request(app)
      .post(`/api/hook-machine/profiles/${body.profile.id}/projects`)
      .send({ notes: 'a product' })
    expect(response.status).toBe(400)
  })
})
