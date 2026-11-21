import { createReadStream } from 'node:fs'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { sharedOpenAIClient } from '@/services/openai.service.js'

export function canTranscribe(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export async function transcribeAudio(file: string): Promise<string> {
  const result = await sharedOpenAIClient().audio.transcriptions.create(
    {
      file: createReadStream(file),
      model: hookMachineConfig.transcribeModel,
      response_format: 'text',
    },
    { timeout: 180_000 },
  )
  // response_format 'text' makes the SDK return the transcript as a string.
  return String(result).trim()
}
