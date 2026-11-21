import { zodTextFormat } from 'openai/helpers/zod'
import type { z } from 'zod'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { mockFor } from '@/services/hook-machine/mock-ai.js'
import { resolveModel, sharedOpenAIClient } from '@/services/openai.service.js'

type StructuredCall<S extends z.ZodType> = {
  name: string
  schema: S
  instructions: string
  input: string
  images?: string[]
  maxOutputTokens?: number
}

export function aiIsMocked(): boolean {
  return hookMachineConfig.mockAi
}

export function aiConfigured(): boolean {
  return hookMachineConfig.mockAi || Boolean(process.env.OPENAI_API_KEY?.trim())
}

/** One model call that must return JSON matching the zod schema. */
export async function structured<S extends z.ZodType>({
  name,
  schema,
  instructions,
  input,
  images = [],
  maxOutputTokens = 8000,
}: StructuredCall<S>): Promise<z.infer<S>> {
  if (hookMachineConfig.mockAi) {
    return schema.parse(mockFor(name)) as z.infer<S>
  }

  const content = [
    { type: 'input_text' as const, text: input },
    ...images.map((image_url) => ({
      type: 'input_image' as const,
      image_url,
      detail: 'low' as const,
    })),
  ]

  const response = await sharedOpenAIClient().responses.parse(
    {
      model: resolveModel(),
      instructions,
      input: [{ role: 'user', content }],
      text: { format: zodTextFormat(schema, name) },
      max_output_tokens: maxOutputTokens,
      store: false,
    },
    { timeout: 180_000 },
  )

  if (response.status !== 'completed' || !response.output_parsed) {
    const why = response.incomplete_details?.reason ?? response.status
    throw new Error(`AI step "${name}" did not finish (${why})`)
  }
  return response.output_parsed as z.infer<S>
}
