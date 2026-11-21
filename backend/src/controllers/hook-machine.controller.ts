import path from 'node:path'

import type { RequestHandler } from 'express'
import { z } from 'zod'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { AppError } from '@/services/error.service.js'
import { aiConfigured, aiIsMocked } from '@/services/hook-machine/ai.js'
import { runProfileAnalysis } from '@/services/hook-machine/analyze.js'
import { agentReachAvailable } from '@/services/hook-machine/collectors/agent-reach.js'
import { ffmpegAvailable } from '@/services/hook-machine/collectors/media.js'
import { ytdlpAvailable } from '@/services/hook-machine/collectors/ytdlp.js'
import {
  reviewHook,
  rewriteScript,
  runProject,
} from '@/services/hook-machine/project.js'
import {
  createDoc,
  listDocs,
  readDoc,
  updateDoc,
} from '@/services/hook-machine/store.js'
import type { Profile, Project, Source } from '@/services/hook-machine/types.js'
import { parsePublicUrl, parseSourceUrl } from '@/services/hook-machine/url.js'
import {
  buildInstructions,
  comboProblem,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL,
  DEFAULT_STYLE_IDS,
  DEFAULT_VOICE,
  DEPRECATION,
  LANGUAGES,
  type LanguageInfo,
  languageInfo,
  MAX_STYLES,
  MODELS,
  RECOMMENDED_VOICES,
  STYLES,
  stylePreset,
} from '@/services/hook-machine/voice/catalog.js'
import {
  isVoiceRunning,
  MAX_INPUT_CHARS,
  scriptLines,
  startVoice,
  takeAudioPath,
} from '@/services/hook-machine/voice/job.js'

const KEY = 'so-hook-machine'
const language = z.enum(['th', 'en'])

const bad = (key: string, message: string, messageTH: string) =>
  new AppError('BAD_REQUEST', { key: `${KEY}-${key}`, message, messageTH })

const notFound = (what: string) =>
  new AppError('NOT_FOUND', { key: `${KEY}-${what}-not-found` })

async function profileOr404(id: string): Promise<Profile> {
  const profile = await readDoc<Profile>('profiles', id)
  if (!profile) throw notFound('profile')
  return profile
}

async function projectOr404(id: string): Promise<Project> {
  const project = await readDoc<Project>('projects', id)
  if (!project) throw notFound('project')
  return project
}

// The list view does not need transcripts or product photos.
const profileSummary = (p: Profile) => ({
  id: p.id,
  name: p.name,
  language: p.language,
  status: p.status,
  createdAt: p.createdAt,
  sourceCount: p.sources.length,
  doneCount: p.sources.filter((s) => s.status === 'done').length,
  mock: p.mock,
})

export const capabilities: RequestHandler = async (_req, res) => {
  const [agentReach, ytDlp, ffmpeg] = await Promise.all([
    agentReachAvailable(),
    ytdlpAvailable(),
    ffmpegAvailable(),
  ])
  res.json({
    success: true,
    agentReach,
    ytDlp,
    ffmpeg,
    ai: aiConfigured(),
    mockAi: aiIsMocked(),
    maxSources: hookMachineConfig.maxSourcesPerProfile,
  })
}

export const listProfiles: RequestHandler = async (_req, res) => {
  const profiles = await listDocs<Profile>('profiles')
  profiles.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  res.json({ success: true, profiles: profiles.map(profileSummary) })
}

export const createProfileBody = z.object({
  name: z.string().trim().min(1).max(80),
  language: language.default('th'),
})

export const createProfile: RequestHandler = async (req, res) => {
  const body = createProfileBody.parse(req.body)
  const profile: Profile = {
    id: crypto.randomUUID(),
    name: body.name,
    language: body.language,
    createdAt: new Date().toISOString(),
    status: 'draft',
    step: null,
    error: null,
    mock: false,
    sources: [],
    insights: null,
    rubric: [],
  }
  await createDoc('profiles', profile)
  res.status(201).json({ success: true, profile })
}

export const getProfile: RequestHandler = async (req, res) => {
  res.json({
    success: true,
    profile: await profileOr404(String(req.params.id)),
  })
}

export const addSourcesBody = z.object({
  urls: z.array(z.string()).min(1).max(50),
})

export const addSources: RequestHandler = async (req, res) => {
  const { urls } = addSourcesBody.parse(req.body)
  const id = String(req.params.id)
  await profileOr404(id)

  const parsed = urls.map((raw) => ({ raw, ok: parseSourceUrl(raw) }))
  const rejected = parsed.filter((p) => !p.ok).map((p) => p.raw)
  const accepted = parsed.flatMap((p) => (p.ok ? [p.ok] : []))
  if (accepted.length === 0) {
    throw bad(
      'no-valid-url',
      'Only YouTube, TikTok and Instagram links are supported.',
      'รองรับเฉพาะลิงก์ YouTube, TikTok และ Instagram',
    )
  }

  const profile = await updateDoc<Profile>('profiles', id, (doc) => {
    const known = new Set(doc.sources.map((s) => s.url))
    for (const { url, platform } of accepted) {
      if (
        known.has(url) ||
        doc.sources.length >= hookMachineConfig.maxSourcesPerProfile
      )
        continue
      known.add(url)
      const source: Source = {
        id: crypto.randomUUID(),
        url,
        platform,
        status: 'pending',
        step: null,
        error: null,
        warnings: [],
        via: [],
        video: null,
        transcript: null,
        transcriptSource: null,
        pacing: null,
        analysis: null,
      }
      doc.sources.push(source)
    }
    if (doc.status === 'ready') doc.status = 'draft'
  })
  res.status(201).json({ success: true, profile, rejected })
}

export const removeSource: RequestHandler = async (req, res) => {
  const profile = await updateDoc<Profile>(
    'profiles',
    String(req.params.id),
    (doc) => {
      doc.sources = doc.sources.filter((s) => s.id !== req.params.sourceId)
    },
  ).catch(() => {
    throw notFound('profile')
  })
  res.json({ success: true, profile })
}

export const analyzeProfile: RequestHandler = async (req, res) => {
  const profile = await profileOr404(String(req.params.id))
  if (profile.status === 'running') {
    throw new AppError('CONFLICT', { key: `${KEY}-already-running` })
  }
  if (profile.sources.length === 0) {
    throw bad(
      'no-sources',
      'Add at least one link first.',
      'ใส่ลิงก์อย่างน้อยหนึ่งลิงก์ก่อน',
    )
  }
  if (!aiConfigured()) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: `${KEY}-no-ai`,
      message:
        'Set OPENAI_API_KEY (or HOOK_MACHINE_MOCK_AI=true for the demo).',
      messageTH:
        'ยังไม่ได้ตั้ง OPENAI_API_KEY (หรือใช้ HOOK_MACHINE_MOCK_AI=true เพื่อดูเดโม)',
    })
  }
  void runProfileAnalysis(profile.id)
  res.status(202).json({ success: true })
}

// Photos arrive already shrunk by the browser. Cap them so one request stays small.
const imageUrl = z
  .string()
  .max(600_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)

export const createProjectBody = z.object({
  title: z.string().trim().max(120).default(''),
  notes: z.string().trim().max(4000).default(''),
  productUrl: z.string().trim().max(2000).default(''),
  images: z.array(imageUrl).max(4).default([]),
  durationSec: z.number().int().min(10).max(90).default(30),
  language: language.optional(),
})

export const createProject: RequestHandler = async (req, res) => {
  const body = createProjectBody.parse(req.body)
  const profile = await profileOr404(String(req.params.id))
  if (profile.status !== 'ready' || !profile.insights) {
    throw bad(
      'profile-not-ready',
      'Analyze the profile first.',
      'ต้องวิเคราะห์โปรไฟล์ให้เสร็จก่อน',
    )
  }
  if (body.images.length === 0 && !body.notes && !body.productUrl) {
    throw bad(
      'empty-project',
      'Add a photo, notes or a product link.',
      'ใส่รูป โน้ต หรือลิงก์สินค้าอย่างน้อยหนึ่งอย่าง',
    )
  }
  let productUrl: string | null = null
  if (body.productUrl) {
    productUrl = parsePublicUrl(body.productUrl)
    if (!productUrl) {
      throw bad(
        'bad-product-url',
        'Product link must be a public http(s) address.',
        'ลิงก์สินค้าต้องเป็นเว็บสาธารณะ (http/https)',
      )
    }
  }

  const project: Project = {
    id: crypto.randomUUID(),
    profileId: profile.id,
    title: body.title || 'สคริปต์ใหม่',
    createdAt: new Date().toISOString(),
    status: 'running',
    step: 'เริ่มทำงาน',
    error: null,
    mock: false,
    language: body.language ?? profile.language,
    input: {
      notes: body.notes,
      productUrl,
      durationSec: body.durationSec,
      images: body.images,
    },
    brief: null,
    research: null,
    hooks: null,
    chosenHook: null,
    script: null,
    review: null,
  }
  await createDoc('projects', project)
  void runProject(project.id)
  res.status(202).json({ success: true, project })
}

export const listProjects: RequestHandler = async (req, res) => {
  const id = String(req.params.id)
  await profileOr404(id)
  const projects = (await listDocs<Project>('projects'))
    .filter((p) => p.profileId === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      createdAt: p.createdAt,
      productName: p.brief?.productName ?? null,
      thumbnail: p.input.images[0] ?? null,
    }))
  res.json({ success: true, projects })
}

export const getProject: RequestHandler = async (req, res) => {
  res.json({
    success: true,
    project: await projectOr404(String(req.params.id)),
  })
}

export const hookBody = z.object({ hook: z.string().trim().min(2).max(600) })

export const chooseHook: RequestHandler = async (req, res) => {
  const { hook } = hookBody.parse(req.body)
  const project = await projectOr404(String(req.params.id))
  if (project.status === 'running')
    throw new AppError('CONFLICT', { key: `${KEY}-busy` })
  void rewriteScript(project.id, hook)
  res.status(202).json({ success: true })
}

export const gradeHook: RequestHandler = async (req, res) => {
  const { hook } = hookBody.parse(req.body)
  const project = await projectOr404(String(req.params.id))
  if (!project.brief)
    throw bad(
      'not-ready',
      'Wait for the research to finish.',
      'รอให้ค้นข้อมูลเสร็จก่อน',
    )
  res.json({ success: true, project: await reviewHook(project.id, hook) })
}

/* ------------------------------------------------------------------- voice */

export const voiceBody = z.object({
  language: z.string().default(DEFAULT_LANGUAGE),
  model: z.string().default(DEFAULT_MODEL),
  voice: z.string().default(DEFAULT_VOICE),
  styles: z.array(z.string()).min(1).max(MAX_STYLES).default(DEFAULT_STYLE_IDS),
})

export const ratingBody = z.object({ stars: z.number().int().min(1).max(5) })

export const voiceOptions: RequestHandler = (_req, res) => {
  res.json({
    success: true,
    defaults: {
      language: DEFAULT_LANGUAGE,
      model: DEFAULT_MODEL,
      voice: DEFAULT_VOICE,
      styles: DEFAULT_STYLE_IDS,
    },
    maxStyles: MAX_STYLES,
    models: MODELS.map((model) => ({
      id: model.id,
      label: model.label,
      note: model.note,
      supportsInstructions: model.supportsInstructions,
      recommended: model.recommended,
      voices: model.voices.map((id) => ({
        id,
        recommended: RECOMMENDED_VOICES.includes(id),
      })),
    })),
    languages: LANGUAGES.map(({ code, name, label }) => ({
      code,
      name,
      label,
    })),
    styles: STYLES.map((style) => ({
      id: style.id,
      label: style.label,
      summary: style.summary,
      speed: style.speed,
      instructions: buildInstructions(
        style,
        languageInfo(DEFAULT_LANGUAGE) ?? (LANGUAGES[0] as LanguageInfo),
        null,
      ),
    })),
    deprecation: DEPRECATION,
    disclosure: 'เสียงนี้สร้างด้วย AI ไม่ใช่เสียงมนุษย์ ควรแจ้งผู้ชมเมื่อนำไปเผยแพร่',
  })
}

export const createVoice: RequestHandler = async (req, res) => {
  const body = voiceBody.parse(req.body)
  const project = await projectOr404(String(req.params.id))

  if (!languageInfo(body.language)) {
    throw bad(
      'voice-language',
      `Unsupported language "${body.language}".`,
      'ไม่รองรับภาษานี้',
    )
  }
  const problem = comboProblem(body.model, body.voice)
  if (problem) throw bad('voice-combo', problem, 'โมเดลกับเสียงที่เลือกใช้ด้วยกันไม่ได้')
  const styles = [...new Set(body.styles)]
  const unknown = styles.find((id) => !stylePreset(id))
  if (unknown)
    throw bad('voice-style', `Unknown style "${unknown}".`, 'ไม่รู้จักสไตล์ที่เลือก')

  if (!project.script || project.status !== 'ready') {
    throw bad(
      'voice-no-script',
      'Finish the script before making a voice.',
      'ต้องมีสคริปต์ที่เสร็จแล้วก่อนสร้างเสียง',
    )
  }
  if (isVoiceRunning(project.id) || project.voice?.status === 'running') {
    throw new AppError('CONFLICT', { key: `${KEY}-voice-busy` })
  }
  if (!aiConfigured()) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: `${KEY}-no-ai`,
      message:
        'Set OPENAI_API_KEY (or HOOK_MACHINE_MOCK_AI=true for the demo).',
      messageTH:
        'ยังไม่ได้ตั้ง OPENAI_API_KEY (หรือใช้ HOOK_MACHINE_MOCK_AI=true เพื่อดูเดโม)',
    })
  }
  if (scriptLines(project).join('\n').length > MAX_INPUT_CHARS) {
    throw bad(
      'voice-too-long',
      `The script is over ${MAX_INPUT_CHARS} characters.`,
      `สคริปต์ยาวเกิน ${MAX_INPUT_CHARS} ตัวอักษร`,
    )
  }

  const voice = await startVoice(project.id, {
    language: body.language,
    model: body.model,
    voice: body.voice,
    styleIds: styles,
  })
  res.status(202).json({ success: true, voice })
}

const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

export const takeAudio: RequestHandler = async (req, res) => {
  const project = await projectOr404(String(req.params.id))
  const take = project.voice?.takes.find((t) => t.id === req.params.takeId)
  const file = take ? takeAudioPath(project.id, take.id) : null
  if (!take || !file || take.status !== 'done') throw notFound('voice-take')

  const name = `${slug(project.brief?.productName ?? '') || 'script'}-${take.styleId}-ai-voice.wav`
  const disposition = req.query.download === '1' ? 'attachment' : 'inline'
  res.sendFile(
    path.resolve(file),
    {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `${disposition}; filename="${name}"`,
        // Every take is synthetic speech, and the file says so.
        'X-AI-Generated-Voice': 'true',
        // The page is on another origin and plays this with a plain audio element.
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'private, max-age=300',
      },
      dotfiles: 'deny',
    },
    (error) => {
      if (error && !res.headersSent) res.status(404).json({ success: false })
    },
  )
}

export const rateTake: RequestHandler = async (req, res) => {
  const { stars } = ratingBody.parse(req.body)
  const projectId = String(req.params.id)
  await projectOr404(projectId)
  const takeId = String(req.params.takeId)
  const project = await updateDoc<Project>('projects', projectId, (doc) => {
    const take = doc.voice?.takes.find((t) => t.id === takeId)
    if (take) take.userRating = stars
  })
  if (!project.voice?.takes.some((t) => t.id === takeId))
    throw notFound('voice-take')
  res.json({ success: true, project })
}
