import { competitorBrandsFrom } from '@/services/hook-machine/hook-checks.js'
import { spokenUnits } from '@/services/hook-machine/script-budget.js'
import { liveScriptConfig } from '@/services/live-script/config.js'
import {
  type DetectDeps,
  type DetectInput,
  detect,
  guessLanguage,
} from '@/services/live-script/detect.js'
import { allowedFor } from '@/services/live-script/grounding.js'
import { type Publish, pushToObs } from '@/services/live-script/obs.js'
import {
  buildSuggestion,
  LONG_PAUSE_MS,
  type SuggestContext,
  type SuggestDeps,
  type Suggestion,
  stumbled,
} from '@/services/live-script/suggest.js'
import type { LiveShowDoc } from '@/services/live-script/types.js'

type Final = { text: string; tsMs: number }

export type Session = {
  id: string
  ownerId: string
  showId: string
  showOnStream: boolean
  createdAt: number
  lastActivity: number
  ctx: SuggestContext
  /** The last minute or so of finished sentences, oldest first. */
  finals: Final[]
  lastFinalTs: number | null
  /** When the first partial of the current sentence arrived. */
  sentenceStartTs: number | null
  partial: string
  used: string[]
  last: Suggestion | null
  /** Counts finished sentences. A result is stale once a newer one has arrived. */
  seq: number
  inflight: AbortController | null
  /** The computation in progress, so only one runs at a time. */
  running: Promise<unknown>
}

/** Sessions live in this process. Nothing about them is written to disk. */
const sessions = new Map<string, Session>()
let sweeper: ReturnType<typeof setInterval> | null = null

export const activeSessionCount = () => sessions.size
export const sessionIds = () => [...sessions.keys()]

/** A session needs the playbook facts, copied once so replies never need the show again. */
export function buildContext(show: LiveShowDoc): SuggestContext | null {
  if (!show.playbook) return null
  const facts = (show.research?.facts ?? []).map((f) => f.claim)
  const supportText = [
    show.input.notes,
    ...Object.values(show.input.offer),
    ...facts,
    ...(show.research?.sellingPoints ?? []),
  ].join(' ')
  return {
    productName: show.brief?.productName ?? null,
    playbook: show.playbook,
    facts,
    offer: show.input.offer,
    allowed: allowedFor(show),
    otherBrands: competitorBrandsFrom({
      titles: (show.research?.sources ?? []).map((s) => s.title),
      productName: show.brief?.productName ?? null,
      notes: show.input.notes,
      supportText,
    }),
    style: show.style,
  }
}

function ensureSweeper() {
  if (sweeper) return
  sweeper = setInterval(() => sweepSessions(Date.now()), 60_000)
  sweeper.unref?.()
}

/** Ends sessions that have heard nothing for the idle limit (4 hours by default). */
export function sweepSessions(now: number): number {
  const limit = liveScriptConfig().sessionIdleMs
  let ended = 0
  for (const session of sessions.values()) {
    if (now - session.lastActivity >= limit) {
      endById(session.id)
      ended++
    }
  }
  return ended
}

function endById(id: string): boolean {
  const session = sessions.get(id)
  if (!session) return false
  session.inflight?.abort()
  sessions.delete(id)
  return true
}

/**
 * Starts a listening session. An account has one: starting another ends the
 * first, so a page reload never leaves a stale session behind.
 */
export function startSession(args: {
  ownerId: string
  show: LiveShowDoc
  showOnStream: boolean
  now?: number
}): Session | null {
  const ctx = buildContext(args.show)
  if (!ctx) return null
  for (const existing of [...sessions.values()]) {
    if (existing.ownerId === args.ownerId) endById(existing.id)
  }
  const now = args.now ?? Date.now()
  const session: Session = {
    id: crypto.randomUUID(),
    ownerId: args.ownerId,
    showId: args.show.id,
    showOnStream: args.showOnStream,
    createdAt: now,
    lastActivity: now,
    ctx,
    finals: [],
    lastFinalTs: null,
    sentenceStartTs: null,
    partial: '',
    used: [],
    last: null,
    seq: 0,
    inflight: null,
    running: Promise.resolve(),
  }
  sessions.set(session.id, session)
  ensureSweeper()
  return session
}

/** Someone else's session reads as missing, like every other owned document. */
export function ownedSession(ownerId: string, id: string): Session | null {
  const session = sessions.get(id)
  return session && session.ownerId === ownerId ? session : null
}

export function endSession(ownerId: string, id: string): boolean {
  return ownedSession(ownerId, id) ? endById(id) : false
}

/* ------------------------------------------------------------- utterances */

const MAX_FINALS = 40
const MAX_TRANSCRIPT_CHARS = 6000

function trimFinals(session: Session) {
  const window = liveScriptConfig().windowMs
  const newest = session.finals[session.finals.length - 1]?.tsMs ?? 0
  session.finals = session.finals
    .filter((f) => newest - f.tsMs <= window)
    .slice(-MAX_FINALS)
  // A hard cap on what is kept, so a long live never grows the state.
  let total = 0
  const kept: Final[] = []
  for (const f of [...session.finals].reverse()) {
    total += f.text.length
    if (total > MAX_TRANSCRIPT_CHARS) break
    kept.unshift(f)
  }
  session.finals = kept
}

export type UtteranceDeps = {
  detect?: DetectDeps
  suggest?: SuggestDeps
  publish?: Publish
  now?: () => number
}

export type Utterance = { text: string; final: boolean; tsMs: number }

const isAbort = (error: unknown) =>
  (error as { name?: string })?.name === 'AbortError' ||
  (error as { name?: string })?.name === 'APIUserAbortError'

/**
 * One result from the browser's speech to text.
 *
 * Partial results only update a light state. A finished sentence cancels the
 * computation for any older sentence (its answer would be stale), waits for
 * that one to wind down so only one runs at a time, and then works out what
 * the seller is doing and what to say next. A sentence that a newer one has
 * replaced is dropped without a model call and answers with no suggestion.
 */
export async function submitUtterance(
  session: Session,
  utterance: Utterance,
  deps: UtteranceDeps = {},
): Promise<Suggestion | null> {
  const now = deps.now ?? Date.now
  session.lastActivity = now()

  if (!utterance.final) {
    if (session.sentenceStartTs == null)
      session.sentenceStartTs = utterance.tsMs
    session.partial = utterance.text
    return null
  }

  const language = guessLanguage(utterance.text)
  // When the sentence began: its first partial, or the end time minus what it takes to say it.
  const spokenMs = Math.round(
    (spokenUnits(utterance.text, language) / (language === 'th' ? 10.5 : 3.4)) *
      1000,
  )
  const startedAt =
    session.sentenceStartTs ?? Math.max(0, utterance.tsMs - spokenMs)
  const pause =
    session.lastFinalTs != null ? startedAt - session.lastFinalTs : 0
  const hesitation = pause >= LONG_PAUSE_MS || stumbled(utterance.text)

  session.finals.push({ text: utterance.text, tsMs: utterance.tsMs })
  session.lastFinalTs = utterance.tsMs
  session.sentenceStartTs = null
  session.partial = ''
  trimFinals(session)

  const seq = ++session.seq
  session.inflight?.abort()
  const controller = new AbortController()
  session.inflight = controller
  const previous = session.running

  const run = (async (): Promise<Suggestion | null> => {
    await previous.catch(() => undefined)
    // A newer sentence arrived while this one waited: it is stale.
    if (session.seq !== seq || controller.signal.aborted) return null

    const ctx = session.ctx
    const recent = session.finals.map((f) => f.text).join(' ')
    const input: DetectInput = {
      recent,
      latest: utterance.text,
      productName: ctx.productName,
      sellingPoints: ctx.playbook.sellingPoints,
      facts: ctx.facts,
      offer: ctx.offer,
      allowed: ctx.allowed,
    }
    const detection = await detect(input, controller.signal, deps.detect)
    if (session.seq !== seq) return null

    return buildSuggestion(
      {
        ctx,
        detection,
        latest: utterance.text,
        recent,
        used: session.used,
        lastLines: session.last?.next ?? [],
        hesitation,
        signal: controller.signal,
        timeoutMs: liveScriptConfig().suggestTimeoutMs,
      },
      deps.suggest,
    )
  })()
  session.running = run

  let suggestion: Suggestion | null
  try {
    suggestion = await run
  } catch (error) {
    if (isAbort(error) || controller.signal.aborted) return null
    throw error
  } finally {
    if (session.inflight === controller) session.inflight = null
  }
  // Another sentence finished while this one was being worked out.
  if (session.seq !== seq || !suggestion) return null

  session.last = suggestion
  session.used = [...session.used, ...suggestion.next].slice(-40)
  void pushToObs(
    session.ownerId,
    suggestion,
    session.showOnStream,
    deps.publish,
  )
  return suggestion
}
