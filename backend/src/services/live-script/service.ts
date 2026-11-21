import { AppError } from '@/services/error.service.js'
import { aiConfigured, aiIsMocked } from '@/services/live-script/ai.js'
import type { Offer } from '@/services/live-script/checks.js'
import { classifyError, ShowError } from '@/services/live-script/errors.js'
import {
  Cancelled,
  type RunState,
  runShowPipeline,
  type StyleContext,
} from '@/services/live-script/generate.js'
import { liveReply } from '@/services/live-script/reply.js'
import { liveScriptConfig } from '@/services/live-script/config.js'
import {
  activeShowCount,
  createShow,
  deleteShowFile,
  isOwnerBusy,
  isShowRunning,
  listOwnedShows,
  markActive,
  markIdle,
  pruneOldShows,
  readOwnedShow,
  updateShow,
} from '@/services/live-script/store.js'
import {
  type LiveReply,
  type LiveShowDoc,
  type Show,
  STEP_COUNT,
} from '@/services/live-script/types.js'
import { logger } from '@/services/logger.service.js'

const KEY = 'so-live-script'

export const notFound = (what: string) =>
  new AppError('NOT_FOUND', { key: `${KEY}-${what}-not-found` })

export class ShowBusyError extends Error {
  constructor(readonly reason: 'owner' | 'capacity') {
    super(`live show refused: ${reason}`)
    this.name = 'ShowBusyError'
  }
}

// Shows being written in this process, so a delete or the watchdog can stop one.
const states = new Map<string, RunState>()

export function toShow(doc: LiveShowDoc): Show {
  return {
    id: doc.id,
    status: doc.status,
    step: doc.step,
    stepIndex: doc.stepIndex,
    stepCount: STEP_COUNT,
    error: doc.error,
    createdAt: doc.createdAt,
    profileName: doc.profileName,
    product: doc.brief
      ? { name: doc.brief.productName, category: doc.brief.category }
      : null,
    playbook: doc.status === 'ready' ? doc.playbook : null,
    warnings: doc.warnings,
    verified: doc.verified,
    mock: doc.mock,
  }
}

export async function showFor(
  ownerId: string,
  id: string,
): Promise<LiveShowDoc> {
  const doc = await readOwnedShow(ownerId, id)
  if (!doc) throw notFound('show')
  return doc
}

export const listShowsFor = (ownerId: string) => listOwnedShows(ownerId)

export type StartParams = {
  ownerId: string
  profile: { id: string; name: string; style: StyleContext } | null
  brief: string
  images: string[]
  productUrl: string | null
  offer: Offer
}

/**
 * Saves a running show and writes it in the background. The checks that need
 * no waiting happen before the first await, so two quick requests cannot both
 * get in.
 */
export async function startShow(params: StartParams): Promise<LiveShowDoc> {
  const id = crypto.randomUUID()
  if (isOwnerBusy(params.ownerId)) throw new ShowBusyError('owner')
  if (activeShowCount() >= liveScriptConfig().maxConcurrent) {
    throw new ShowBusyError('capacity')
  }
  markActive(id, params.ownerId)

  const state: RunState = { cancelled: false }
  states.set(id, state)
  try {
    const style = params.profile?.style ?? null
    const doc: LiveShowDoc = {
      id,
      ownerId: params.ownerId,
      createdAt: new Date().toISOString(),
      status: 'running',
      step: null,
      stepIndex: 0,
      error: null,
      errorCode: null,
      mock: aiIsMocked(),
      language: 'th',
      profileId: params.profile?.id ?? null,
      profileName: params.profile?.name ?? null,
      style: style
        ? {
            name: style.name,
            styleSummary: style.styleSummary,
            voice: style.voice,
          }
        : null,
      input: {
        notes: params.brief,
        productUrl: params.productUrl,
        offer: params.offer,
        imageCount: params.images.length,
      },
      brief: null,
      research: null,
      hooks: null,
      show: null,
      playbook: null,
      verified: false,
      warnings: [],
    }
    await createShow(doc)
    // Photos and the style copy stay in memory for this run and are not saved.
    void runInBackground(id, params.ownerId, params.images, style, state)
    return doc
  } catch (error) {
    markIdle(id)
    states.delete(id)
    throw error
  }
}

async function fail(id: string, error: unknown): Promise<void> {
  const { code, messageTH } = classifyError(error, null)
  logger.error('LIVE_SCRIPT_FAILED', error, { id, code })
  await updateShow(id, (d) => {
    if (d.status !== 'running') return
    d.status = 'error'
    d.step = null
    d.errorCode = code
    d.error = messageTH
  }).catch(() => undefined)
}

async function runInBackground(
  id: string,
  ownerId: string,
  images: string[],
  style: StyleContext | null,
  state: RunState,
): Promise<void> {
  const watchdog = setTimeout(() => {
    state.cancelled = true
    void fail(id, new ShowError('timeout', 'live show timed out'))
  }, liveScriptConfig().timeoutMs)
  watchdog.unref?.()
  try {
    await runShowPipeline({ id, images, style, state })
  } catch (error) {
    if (!(error instanceof Cancelled)) await fail(id, error)
  } finally {
    clearTimeout(watchdog)
    markIdle(id)
    states.delete(id)
    await pruneOldShows(ownerId).catch(() => undefined)
  }
}

export async function deleteShow(ownerId: string, id: string): Promise<void> {
  const doc = await showFor(ownerId, id)
  if (doc.status === 'running' && isShowRunning(id)) {
    throw new AppError('CONFLICT', {
      key: `${KEY}-running`,
      message: 'The show is still being written.',
      messageTH: 'กำลังเขียนบทพูดอยู่ รอให้เสร็จก่อนแล้วค่อยลบ',
    })
  }
  await deleteShowFile(id)
}

export async function replyFor(
  ownerId: string,
  id: string,
  comment: string,
): Promise<LiveReply> {
  const show = await showFor(ownerId, id)
  if (show.status !== 'ready' || !show.show) {
    throw new AppError('BAD_REQUEST', {
      key: `${KEY}-not-ready`,
      message: 'The run of show is not ready yet.',
      messageTH: 'บทพูดยังไม่เสร็จ รอสักครู่',
    })
  }
  if (!aiConfigured()) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: `${KEY}-no-ai`,
      message: 'Set OPENAI_API_KEY (or HOOK_MACHINE_MOCK_AI=true for the demo).',
      messageTH: 'ตอนนี้ยังตอบคอมเมนต์ไม่ได้ ระบบ AI ยังไม่พร้อม',
    })
  }
  return liveReply(show, comment)
}
