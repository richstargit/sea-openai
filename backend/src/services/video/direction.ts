import type { ResponseInput } from 'openai/resources/responses/responses'
import { z } from 'zod'
import { AppError } from '@/services/error.service.js'
import { createOpenAIResponse } from '@/services/openai.service.js'
export async function select<T extends z.ZodObject>(
  name: string,
  schema: T,
  instructions: string,
  input: string | ResponseInput,
  signal: AbortSignal,
  maxOutputTokens = 768,
): Promise<z.infer<T>> {
  const parameters = z.toJSONSchema(schema, { io: 'input' })
  delete parameters.$schema
  try {
    const result = await createOpenAIResponse(
      {
        instructions,
        input,
        tools: [
          {
            type: 'function',
            name,
            description: instructions,
            parameters,
            strict: true,
          },
        ],
        tool_choice: { type: 'function', name },
        parallel_tool_calls: false,
        max_output_tokens: maxOutputTokens,
      },
      signal,
    )
    const call = result.output.find(
      (item) => item.type === 'function_call' && item.name === name,
    )
    if (call?.type !== 'function_call')
      throw new Error('Missing video decision')
    return schema.parse(JSON.parse(call.arguments))
  } catch (cause) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: 'so-video-provider',
      cause,
    })
  }
}
