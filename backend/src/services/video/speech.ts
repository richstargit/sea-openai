import { OpenAIRealtimeWS } from 'openai/realtime/ws'
import { openAIClient } from '@/services/openai.service.js'

export async function speakScript(
  text: string,
  direction: string,
  voice: string,
  signal: AbortSignal,
) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(90_000)])
  deadline.throwIfAborted()
  const model = process.env.OPENAI_SPEECH_MODEL?.trim() || 'gpt-realtime-2.1'
  const session = await OpenAIRealtimeWS.create(openAIClient(), {
    model,
    options: { handshakeTimeout: 15_000 },
  })
  const chunks: Buffer[] = []
  let size = 0
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const stop = () => reject(deadline.reason)
      session.on('error', reject)
      session.socket.once('close', () => {
        deadline.removeEventListener('abort', stop)
        reject(new Error('Voice session closed before completion'))
      })
      deadline.addEventListener('abort', stop, { once: true })
      if (deadline.aborted) return stop()
      session.on('session.created', () => {
        session.send({
          type: 'response.create',
          response: {
            output_modalities: ['audio'],
            audio: {
              output: { voice, format: { type: 'audio/pcm', rate: 24000 } },
            },
            instructions:
              'You are recording voiceover for a film. Perform the supplied script verbatim in its original language, without introduction, additional words, or sound effects. Follow the performance direction only for delivery.',
            input: [
              {
                type: 'message',
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: JSON.stringify({
                      script: text,
                      performance: direction,
                    }),
                  },
                ],
              },
            ],
          },
        })
      })
      session.on('response.output_audio.delta', ({ delta }) => {
        const bytes = Buffer.from(delta, 'base64')
        size += bytes.length
        if (size > 16 * 1024 * 1024)
          return reject(new Error('Voice recording exceeds the clip limit'))
        chunks.push(bytes)
      })
      session.on('response.done', ({ response }) => {
        if (response.status !== 'completed' || !size || size % 2)
          return reject(new Error('Incomplete voice recording'))
        resolve(Buffer.concat(chunks, size))
      })
    })
  } finally {
    session.close()
  }
}
