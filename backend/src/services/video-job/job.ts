import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { aiIsMocked } from '@/services/hook-machine/ai.js'
import { runProject } from '@/services/hook-machine/project.js'
import {
  createDoc,
  deleteDoc,
  listDocs,
  readDoc,
  updateDoc,
} from '@/services/hook-machine/store.js'
import type { Profile, Project } from '@/services/hook-machine/types.js'
import {
  buildInstructions,
  languageInfo,
  modelInfo,
  stylePreset,
} from '@/services/hook-machine/voice/catalog.js'
import {
  MAX_INPUT_CHARS,
  spokenLines,
} from '@/services/hook-machine/voice/job.js'
import { speechProvider } from '@/services/hook-machine/voice/provider.js'
import { suggestStyles } from '@/services/hook-machine/voice/suggest.js'
import { logger } from '@/services/logger.service.js'
import { composer, placeholderImage } from '@/services/video-job/composer.js'
import {
  classifyError,
  VIDEO_ERRORS,
  VideoJobError,
} from '@/services/video-job/errors.js'
import {
  VIDEO_STEPS,
  type VideoDoc,
  type VideoStep,
} from '@/services/video-job/types.js'

const UUID = /^[0-9a-f-]{36}$/

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/** Read on every call so tests can shorten the limits. Production uses the defaults. */
export function videoJobConfig() {
  return {
    maxConcurrent: positiveInt(process.env.VIDEO_JOB_MAX_CONCURRENT, 2),
    timeoutMs: positiveInt(process.env.VIDEO_JOB_TIMEOUT_MS, 10 * 60 * 1000),
    keepPerAccount: positiveInt(process.env.VIDEO_JOB_KEEP, 30),
  }
}

/* -------------------------------------------------------------------- paths */

/** The only place a video folder path is built, and only from a validated id. */
export function videoDir(id: string): string | null {
  if (!UUID.test(id)) return null
  return path.join(hookMachineConfig.dataDir, 'videos', id)
}

export function videoFilePath(id: string): string | null {
  const dir = videoDir(id)
  return dir ? path.join(dir, 'final.mp4') : null
}

/* ------------------------------------------------------------ pure helpers */

export function dataUrlBuffer(url: string): Buffer | null {
  const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    url,
  )
  const bytes = match?.[1] ? Buffer.from(match[1], 'base64') : null
  return bytes && bytes.length > 0 ? bytes : null
}

type ScriptBeat = { voiceover: string; imageIndex: number | null }

/**
 * The captions must be the words that are spoken, which may be a translation.
 * Pairs each spoken line with the script beat it came from, so the photo that
 * the writer chose for a beat stays with that sentence.
 */
export function alignSpokenToBeats(
  beats: ScriptBeat[],
  lines: string[],
): { text: string; imageIndex: number | null }[] {
  if (lines.length === 0) return []
  const source = beats.filter((beat) => beat.voiceover.trim())
  if (source.length === 0)
    return lines.map((text) => ({ text, imageIndex: null }))
  if (lines.length === source.length) {
    return lines.map((text, i) => ({
      text,
      imageIndex: source[i]?.imageIndex ?? null,
    }))
  }

  // A line vanished or split in translation: spread the lines over the beats in order.
  const out = source.map((beat) => ({
    text: '',
    imageIndex: beat.imageIndex,
  }))
  lines.forEach((text, i) => {
    const slot =
      out[Math.min(out.length - 1, Math.floor((i * out.length) / lines.length))]
    if (slot) slot.text = slot.text ? `${slot.text} ${text}` : text
  })
  return out.filter((beat) => beat.text)
}

/* --------------------------------------------------------- job bookkeeping */

type Reason = 'owner' | 'capacity'
export class VideoBusyError extends Error {
  constructor(readonly reason: Reason) {
    super(`video job refused: ${reason}`)
    this.name = 'VideoBusyError'
  }
}

// videoId -> ownerId, for jobs running in this process.
const active = new Map<string, string>()

export const activeJobCount = () => active.size
export const isOwnerBusy = (ownerId: string) =>
  [...active.values()].includes(ownerId)
export const isVideoRunning = (id: string) => active.has(id)

function reserve(id: string, ownerId: string): void {
  if (isOwnerBusy(ownerId)) throw new VideoBusyError('owner')
  if (active.size >= videoJobConfig().maxConcurrent)
    throw new VideoBusyError('capacity')
  active.set(id, ownerId)
}

class Cancelled extends Error {}

type StartParams = {
  ownerId: string
  profile: Profile
  brief: string
  images: string[]
  productUrl: string | null
  durationSec: number
  voice: { language: string; model: string; voice: string }
}

/**
 * Creates the normal script project and the video job, then does the slow
 * work in the background. The checks that need no waiting happen before the
 * first await, so two quick requests cannot both get in.
 */
export async function startVideoJob(params: StartParams): Promise<VideoDoc> {
  const id = crypto.randomUUID()
  const projectId = crypto.randomUUID()
  reserve(id, params.ownerId)

  try {
    const now = new Date().toISOString()
    const styleId =
      suggestStyles(params.profile.insights?.voice)?.styles[0] ?? 'creator'
    const mock = aiIsMocked()

    const project: Project = {
      id: projectId,
      ownerId: params.ownerId,
      profileId: params.profile.id,
      title: 'วิดีโอ',
      createdAt: now,
      status: 'running',
      step: 'เริ่มทำงาน',
      error: null,
      mock,
      language: params.profile.language,
      input: {
        notes: params.brief,
        productUrl: params.productUrl,
        durationSec: params.durationSec,
        images: params.images,
      },
      brief: null,
      research: null,
      hooks: null,
      chosenHook: null,
      script: null,
      review: null,
    }
    const video: VideoDoc = {
      id,
      ownerId: params.ownerId,
      profileId: params.profile.id,
      projectId,
      createdAt: now,
      durationSec: params.durationSec,
      voiceLanguage: params.voice.language,
      voice: {
        model: params.voice.model,
        voice: params.voice.voice,
        styleId,
      },
      status: 'running',
      step: 'brief',
      stepIndex: 1,
      errorCode: null,
      error: null,
      file: null,
      mock,
      trail: ['brief'],
    }
    await createDoc('projects', project)
    await createDoc('videos', video)
    void runVideoJob(id)
    return video
  } catch (error) {
    active.delete(id)
    throw error
  }
}

const markStep = (id: string, step: VideoStep) =>
  updateDoc<VideoDoc>('videos', id, (doc) => {
    if (doc.status !== 'running') return
    doc.step = step
    doc.stepIndex = VIDEO_STEPS.indexOf(step) + 1
    if (doc.trail[doc.trail.length - 1] !== step) doc.trail.push(step)
  })

type State = {
  stage: VideoStep | null
  cancelled: boolean
  finished: boolean
  /** True only when the finished clip was stored, so its files must stay. */
  ok: boolean
}

async function runVideoJob(id: string): Promise<void> {
  const state: State = {
    stage: null,
    cancelled: false,
    finished: false,
    ok: false,
  }
  const config = videoJobConfig()
  let ownerId: string | null = null

  // Writes the final state once. Whoever gets here first (done, failed or the
  // watchdog) wins, and the job stops counting against the limits.
  const settle = async (change: (doc: VideoDoc) => void): Promise<boolean> => {
    if (state.finished) return false
    state.finished = true
    active.delete(id)
    await updateDoc<VideoDoc>('videos', id, (doc) => {
      if (doc.status === 'running') change(doc)
    }).catch((error) => logger.error('VIDEO_JOB_WRITE_FAILED', error, { id }))
    return true
  }
  const fail = (error: unknown) => {
    const { code, messageTH } = classifyError(error, state.stage)
    logger.error('VIDEO_JOB_FAILED', error, { id, stage: state.stage, code })
    return settle((doc) => {
      doc.status = 'error'
      doc.step = null
      doc.errorCode = code
      doc.error = messageTH
    })
  }

  const watchdog = setTimeout(() => {
    state.cancelled = true
    void fail(new VideoJobError('timeout', 'video job timed out'))
  }, config.timeoutMs)
  watchdog.unref?.()

  try {
    const doc = await readDoc<VideoDoc>('videos', id)
    if (!doc) return
    ownerId = doc.ownerId
    await pipeline(doc, state, settle)
  } catch (error) {
    if (!(error instanceof Cancelled)) await fail(error)
  } finally {
    clearTimeout(watchdog)
    active.delete(id)
    // Only a stored clip keeps its folder; half written work is never left behind.
    if (!state.ok) await removeWorkFiles(id)
    if (ownerId) await pruneOldVideos(ownerId).catch(() => undefined)
  }
}

async function pipeline(
  video: VideoDoc,
  state: State,
  settle: (change: (doc: VideoDoc) => void) => Promise<boolean>,
): Promise<void> {
  const id = video.id
  const checkpoint = () => {
    if (state.cancelled) throw new Cancelled()
  }
  // Step writes are chained, so a late write can never land after a newer step.
  let writes: Promise<unknown> = Promise.resolve()
  const enter = (step: VideoStep) => {
    state.stage = step
    writes = writes.then(() => markStep(id, step))
    return writes
  }

  // 1 to 4: the same script pipeline as the script feature, best hook picked automatically.
  await enter('brief')
  await runProject(video.projectId, (phase) => {
    void enter(phase)
  })
  await writes
  checkpoint()

  const project = await readDoc<Project>('projects', video.projectId)
  if (project?.status !== 'ready' || !project.script) {
    throw new VideoJobError(
      'script_failed',
      project?.error ?? 'the script was not produced',
    )
  }

  // 5: one take, no scoring.
  await enter('voice')
  await writes
  const language = languageInfo(video.voiceLanguage)
  const model = modelInfo(video.voice.model)
  const preset = stylePreset(video.voice.styleId) ?? stylePreset('creator')
  if (!language || !model || !preset) {
    throw new VideoJobError('voice_failed', 'unsupported voice settings')
  }
  const { lines } = await spokenLines(project, video.voiceLanguage)
  const input = lines.join('\n')
  if (!input) throw new VideoJobError('voice_failed', 'nothing to read aloud')
  if (input.length > MAX_INPUT_CHARS) {
    throw new VideoJobError(
      'script_too_long',
      `spoken text is ${input.length} characters`,
    )
  }
  const productName = project.brief?.productName ?? null
  const instructions = buildInstructions(preset, language, productName)
  const wav = await speechProvider().synthesize({
    model: model.id,
    voice: video.voice.voice,
    input,
    ...(model.supportsInstructions
      ? { instructions }
      : { speed: preset.speed }),
  })
  checkpoint()

  const dir = videoDir(id)
  if (!dir) throw new Error('bad video id')
  await mkdir(dir, { recursive: true })
  const audioPath = path.join(dir, 'voice.wav')
  await writeFile(audioPath, wav)

  // 6: the picture, captions and the voice become one MP4.
  await enter('compose')
  await writes
  const images = project.input.images
    .map(dataUrlBuffer)
    .filter((bytes): bytes is Buffer => bytes !== null)
  const title = (productName ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (images.length === 0) images.push(await placeholderImage(title))
  const beats = alignSpokenToBeats(project.script.beats, lines).map((beat) => ({
    voiceover: beat.text,
    imageIndex:
      beat.imageIndex !== null &&
      beat.imageIndex >= 0 &&
      beat.imageIndex < images.length
        ? beat.imageIndex
        : null,
  }))

  const renderPath = path.join(dir, 'render.mp4')
  const finalPath = path.join(dir, 'final.mp4')
  const outcome = await composer({
    beats,
    images,
    audioPath,
    outPath: renderPath,
    title: title || undefined,
    mock: aiIsMocked(),
  })
  checkpoint()

  await rename(outcome.path, finalPath)
  const size = (await stat(finalPath)).size
  if (size === 0) throw new VideoJobError('compose_failed', 'empty output file')
  await rm(audioPath, { force: true })

  state.ok = await settle((doc) => {
    doc.status = 'ready'
    doc.step = null
    doc.stepIndex = VIDEO_STEPS.length
    doc.error = null
    doc.errorCode = null
    doc.file = {
      sizeBytes: size,
      durationSec: Math.round(outcome.durationSec * 10) / 10,
    }
  })
}

/* ------------------------------------------------------- reading and files */

export async function ownedVideo(
  id: string,
  ownerId: string,
): Promise<VideoDoc | null> {
  const doc = await readDoc<VideoDoc>('videos', id)
  return doc && doc.ownerId === ownerId ? doc : null
}

export async function ownedVideos(
  ownerId: string,
  limit = 30,
): Promise<VideoDoc[]> {
  return (await listDocs<VideoDoc>('videos'))
    .filter((doc) => doc.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

/** Half written files from a job that did not finish. */
async function removeWorkFiles(id: string): Promise<void> {
  const dir = videoDir(id)
  if (!dir) return
  await rm(dir, { recursive: true, force: true })
}

export async function deleteVideoFully(doc: VideoDoc): Promise<void> {
  await removeWorkFiles(doc.id)
  await deleteDoc('videos', doc.id)
  // The script project was only ever made for this video.
  if (UUID.test(doc.projectId)) {
    await rm(path.join(hookMachineConfig.dataDir, 'audio', doc.projectId), {
      recursive: true,
      force: true,
    })
    await deleteDoc('projects', doc.projectId)
  }
}

/** Keeps the newest finished jobs of one account, removes the rest with their files. */
export async function pruneOldVideos(ownerId: string): Promise<number> {
  const keep = videoJobConfig().keepPerAccount
  const finished = (await ownedVideos(ownerId, Number.MAX_SAFE_INTEGER)).filter(
    (doc) => doc.status !== 'running' && !isVideoRunning(doc.id),
  )
  const old = finished.slice(keep)
  for (const doc of old) await deleteVideoFully(doc)
  return old.length
}

/** Jobs run in this process, so a running job at boot was cut off. */
export async function recoverVideoJobs(): Promise<void> {
  for (const doc of await listDocs<VideoDoc>('videos')) {
    if (doc.status !== 'running') continue
    await updateDoc<VideoDoc>('videos', doc.id, (draft) => {
      draft.status = 'error'
      draft.step = null
      draft.errorCode = 'restart'
      draft.error = VIDEO_ERRORS.restart
    })
    await removeWorkFiles(doc.id)
  }
}

/** Used by tests to confirm nothing is left behind. */
export async function videoFolderNames(): Promise<string[]> {
  try {
    return (
      await readdir(path.join(hookMachineConfig.dataDir, 'videos'))
    ).filter((name) => UUID.test(name))
  } catch {
    return []
  }
}
