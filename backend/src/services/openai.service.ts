import OpenAI from 'openai'
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses'

const DEFAULT_MODEL = 'gpt-6.2-astra'

type GenerateTextOptions = {
  model?: string
  instructions?: string
  maxOutputTokens?: number
}

let client: OpenAI | undefined

export function openAIClient(): OpenAI {
  if (client) return client

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY must be set to generate text')

  client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 })
  return client
}

type ResponseOptions = Omit<
  ResponseCreateParamsNonStreaming,
  'model' | 'store'
> & {
  model?: string
}

export async function createOpenAIResponse(
  { model, ...params }: ResponseOptions,
  signal?: AbortSignal,
) {
  const response = await openAIClient().responses.create(
    {
      ...params,
      model: model?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
      store: false,
    },
    {
      signal,
      timeout:
        params.max_output_tokens && params.max_output_tokens > 2000
          ? 105_000
          : 45_000,
    },
  )

  if (response.status !== 'completed') {
    const reason = response.incomplete_details?.reason ?? response.status
    throw new Error(`OpenAI response did not complete (${reason})`)
  }

  return response
}

export async function generateText(
  input: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  if (!input.trim()) throw new Error('OpenAI input must contain text')

  const response = await createOpenAIResponse({
    model: options.model,
    input,
    instructions: options.instructions,
    max_output_tokens: options.maxOutputTokens,
  })

  if (!response.output_text.trim()) {
    throw new Error('OpenAI returned no text')
  }

  return response.output_text
}

export function sharedOpenAIClient(): OpenAI {
  return openAIClient()
}

export function resolveModel(model?: string): string {
  return model?.trim() || process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL
}
