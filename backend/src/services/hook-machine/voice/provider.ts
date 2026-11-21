import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { synthTone } from '@/services/hook-machine/voice/wav.js'
import { sharedOpenAIClient } from '@/services/openai.service.js'

export type SpeechRequest = {
  model: string
  voice: string
  input: string
  /** Only sent when the model supports it. */
  instructions?: string
  speed?: number
}

/**
 * Anything that can turn text into a wav. The REST provider below is what
 * works today. OpenAI is retiring /v1/audio/speech on 2027-01-06, so a
 * Realtime based provider can slot in here without touching the job.
 */
export interface SpeechProvider {
  synthesize(request: SpeechRequest): Promise<Buffer>
}

type ApiErrorLike = {
  status?: number
  code?: string | null
  error?: { code?: string | null }
  headers?: { get?: (name: string) => string | null }
}

export function retryDelayMs(error: unknown, attempt: number): number | null {
  const e = error as ApiErrorLike
  const code = e.code ?? e.error?.code
  // Running out of quota never fixes itself in a few seconds.
  if (code === 'insufficient_quota') return null
  if (e.status !== 429 && e.status !== 503) return null

  const retryAfter = Number(e.headers?.get?.('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter, 30) * 1000
  }
  const backoff = 500 * 2 ** attempt
  return backoff + Math.random() * backoff * 0.5
}

export async function withRetry<T>(
  run: () => Promise<T>,
  {
    attempts = 4,
    sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
  } = {},
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      const delay = attempt + 1 < attempts ? retryDelayMs(error, attempt) : null
      if (delay === null) throw error
      await sleep(delay)
    }
  }
}

class OpenAiSpeechProvider implements SpeechProvider {
  synthesize(request: SpeechRequest): Promise<Buffer> {
    // Retries are done here so Retry-After and quota errors are handled the same way everywhere.
    const client = sharedOpenAIClient().withOptions({
      maxRetries: 0,
      timeout: 120_000,
    })
    return withRetry(async () => {
      const response = await client.audio.speech.create({
        model: request.model,
        voice: request.voice,
        input: request.input,
        response_format: 'wav',
        ...(request.instructions ? { instructions: request.instructions } : {}),
        ...(request.speed ? { speed: request.speed } : {}),
      })
      return Buffer.from(await response.arrayBuffer())
    })
  }
}

class MockSpeechProvider implements SpeechProvider {
  async synthesize(request: SpeechRequest): Promise<Buffer> {
    // About 2.7 words a second, capped so demo files stay small.
    const words = request.input.split(/\s+/).filter(Boolean).length
    return synthTone(
      Math.min(12, Math.max(2, words / 2.7)),
      200 + (request.input.length % 5) * 30,
    )
  }
}

export function speechProvider(): SpeechProvider {
  return hookMachineConfig.mockAi
    ? new MockSpeechProvider()
    : new OpenAiSpeechProvider()
}
