import { createHash } from 'node:crypto'

import { aiIsMocked } from '@/services/live-script/ai.js'
import { logger } from '@/services/logger.service.js'

/**
 * Live speech to text runs in the seller's browser: the browser opens a
 * realtime transcription socket to OpenAI with a short lived secret minted
 * here, so the API key never leaves the server.
 *
 * Verified against the real API with a Thai speech sample: the secret mints
 * in about 1 s, the socket opens with the subprotocols
 * ['realtime', 'openai-insecure-api-key.<secret>'] on
 * wss://api.openai.com/v1/realtime?intent=transcription, session.update is
 * accepted, and transcripts arrive about 0.3 to 0.45 s after
 * input_audio_buffer.commit. gpt-live-transcribe has no server side voice
 * activity detection (turn_detection must be null), so the browser commits
 * each turn itself after a short silence.
 */

export const REALTIME_URL =
  'wss://api.openai.com/v1/realtime?intent=transcription'
export const SECRET_URL = 'https://api.openai.com/v1/realtime/client_secrets'
export const SECRET_SECONDS = 600
/** Silence in the browser that ends a turn. */
export const VAD_SILENCE_MS = 700

export const transcribeModel = () =>
  process.env.LIVE_TRANSCRIBE_MODEL?.trim() || 'gpt-live-transcribe'

export type TranscriptionSession = {
  type: 'transcription'
  audio: {
    input: {
      format: { type: 'audio/pcm'; rate: 24000 }
      noise_reduction: { type: 'near_field' }
      transcription: {
        model: string
        languages: string[]
        keywords: string[]
        prompt: string
      }
      turn_detection: null
    }
  }
}

/** What the browser needs to open the socket. */
export type TranscriptionGrant = {
  clientSecret: string
  /** Unix seconds. */
  expiresAt: number
  model: string
  url: string
  /** Sent as session.update as it is, so the browser repeats no config. */
  sessionUpdate: TranscriptionSession
  vad: { silenceMs: number }
}

/** Single line terms the recogniser should prefer, without angle brackets. */
export function cleanKeywords(terms: (string | null | undefined)[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const term of terms) {
    const clean = (term ?? '')
      .replace(/[<>\r\n]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const key = clean.toLowerCase()
    if (clean.length < 2 || seen.has(key)) continue
    seen.add(key)
    out.push(clean.slice(0, 60))
    if (out.length >= 10) break
  }
  return out
}

export function sessionConfig(keywords: string[]): TranscriptionSession {
  return {
    type: 'transcription',
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        noise_reduction: { type: 'near_field' },
        transcription: {
          model: transcribeModel(),
          // languages and language are mutually exclusive: send languages only.
          languages: ['th', 'en'],
          keywords,
          prompt: 'ไลฟ์ขายของออนไลน์ภาษาไทย มีคำอังกฤษปนอยู่บ้าง',
        },
        turn_detection: null,
      },
    },
  }
}

export class TranscriptionUnavailable extends Error {
  constructor() {
    super('transcription secret could not be minted')
    this.name = 'TranscriptionUnavailable'
  }
}

/** Mints the secret. Swappable so tests and demo mode need no network. */
export type MintSecret = (args: {
  userId: string
  keywords: string[]
}) => Promise<TranscriptionGrant>

const safetyId = (userId: string) =>
  createHash('sha256').update(userId).digest('hex')

export const mintWithOpenAI: MintSecret = async ({ userId, keywords }) => {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new TranscriptionUnavailable()
  const session = sessionConfig(keywords)
  let response: Response
  try {
    response = await fetch(SECRET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Safety-Identifier': safetyId(userId),
      },
      body: JSON.stringify({
        expires_after: { anchor: 'created_at', seconds: SECRET_SECONDS },
        session,
      }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (error) {
    logger.warn('LIVE_TRANSCRIBE_MINT_FAILED', { reason: String(error) })
    throw new TranscriptionUnavailable()
  }
  if (!response.ok) {
    // The body is not logged: it can echo request details.
    logger.warn('LIVE_TRANSCRIBE_MINT_REJECTED', { status: response.status })
    throw new TranscriptionUnavailable()
  }
  const body = (await response.json().catch(() => null)) as {
    value?: unknown
    expires_at?: unknown
  } | null
  if (typeof body?.value !== 'string' || typeof body.expires_at !== 'number') {
    throw new TranscriptionUnavailable()
  }
  return {
    clientSecret: body.value,
    expiresAt: body.expires_at,
    model: session.audio.input.transcription.model,
    url: REALTIME_URL,
    sessionUpdate: session,
    vad: { silenceMs: VAD_SILENCE_MS },
  }
}

/** Demo mode: a grant that looks real but opens nothing. */
export const mintMock: MintSecret = async ({ keywords }) => {
  const session = sessionConfig(keywords)
  return {
    clientSecret: `ek_mock_${crypto.randomUUID().replace(/-/g, '')}`,
    expiresAt: Math.floor(Date.now() / 1000) + SECRET_SECONDS,
    model: session.audio.input.transcription.model,
    url: REALTIME_URL,
    sessionUpdate: session,
    vad: { silenceMs: VAD_SILENCE_MS },
  }
}

export function defaultMint(): MintSecret {
  return aiIsMocked() ? mintMock : mintWithOpenAI
}
