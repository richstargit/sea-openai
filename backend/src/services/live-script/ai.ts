import { zodTextFormat } from 'openai/helpers/zod'
import type { z } from 'zod'

import { aiIsMocked, structured } from '@/services/hook-machine/ai.js'
import { mockFor } from '@/services/live-script/fixtures.js'
import { resolveModel, sharedOpenAIClient } from '@/services/openai.service.js'

type Call<S extends z.ZodType> = {
  name: string
  schema: S
  instructions: string
  input: string
  images?: string[]
  maxOutputTokens?: number
}

/**
 * One structured model call. In demo mode the answer comes from this module's
 * own fixtures, because the Hook Machine fixtures know nothing about live steps.
 */
export async function ask<S extends z.ZodType>(
  call: Call<S>,
): Promise<z.infer<S>> {
  if (aiIsMocked()) return call.schema.parse(mockFor(call.name)) as z.infer<S>
  return structured(call)
}

export { aiConfigured, aiIsMocked } from '@/services/hook-machine/ai.js'

type FastCall<S extends z.ZodType> = Call<S> & {
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * A small structured call for the live loop. It can be cancelled when a newer
 * utterance makes the answer stale, and it gives up after a few seconds so the
 * seller is never left waiting. Demo mode answers from fixtures.
 */
export async function askFast<S extends z.ZodType>({
  name,
  schema,
  instructions,
  input,
  signal,
  timeoutMs = 6000,
  maxOutputTokens = 300,
}: FastCall<S>): Promise<z.infer<S>> {
  if (aiIsMocked()) return schema.parse(mockFor(name)) as z.infer<S>
  const response = await sharedOpenAIClient()
    .withOptions({ maxRetries: 0 })
    .responses.parse(
      {
        model: process.env.LIVE_SCRIPT_FAST_MODEL?.trim() || resolveModel(),
        instructions,
        input: [
          { role: 'user', content: [{ type: 'input_text', text: input }] },
        ],
        text: { format: zodTextFormat(schema, name) },
        max_output_tokens: maxOutputTokens,
        store: false,
      },
      { signal, timeout: timeoutMs },
    )
  if (response.status !== 'completed' || !response.output_parsed) {
    throw new Error(`AI step "${name}" did not finish`)
  }
  return response.output_parsed as z.infer<S>
}
