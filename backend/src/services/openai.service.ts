import OpenAI from 'openai'

const DEFAULT_MODEL = 'gpt-5.4-mini'

type GenerateTextOptions = {
  model?: string
  instructions?: string
  maxOutputTokens?: number
}

let client: OpenAI | undefined

function openAIClient(): OpenAI {
  if (client) return client

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY must be set to generate text')

  client = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 1 })
  return client
}

export async function generateText(
  input: string,
  options: GenerateTextOptions = {},
): Promise<string> {
  if (!input.trim()) throw new Error('OpenAI input must contain text')

  const response = await openAIClient().responses.create({
    model:
      options.model?.trim() ||
      process.env.OPENAI_MODEL?.trim() ||
      DEFAULT_MODEL,
    input,
    instructions: options.instructions,
    max_output_tokens: options.maxOutputTokens,
    store: false,
  })

  if (response.status !== 'completed') {
    const reason = response.incomplete_details?.reason ?? response.status
    throw new Error(`OpenAI response did not complete (${reason})`)
  }

  if (!response.output_text.trim()) {
    throw new Error('OpenAI returned no text')
  }

  return response.output_text
}
