import { toFile } from 'openai'
import { z } from 'zod'
import { openAIClient } from '@/services/openai.service.js'
import { select } from '@/services/video/direction.js'

export async function transcribeCaptions(
  bytes: Buffer,
  language: string,
  signal: AbortSignal,
) {
  const audio = {
    file: await toFile(bytes, 'audio.mp3', { type: 'audio/mpeg' }),
    ...(language === 'auto' ? {} : { language }),
  }
  const transcriptions = openAIClient().audio.transcriptions
  const [transcript, timing] = await Promise.all([
    transcriptions.create(
      {
        ...audio,
        model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-transcribe',
        response_format: 'json',
      },
      { signal },
    ),
    transcriptions.create(
      { ...audio, model: 'whisper-1', response_format: 'srt' },
      { signal },
    ),
  ])
  const text = transcript.text.trim()
  if (!text) return ''
  const cues = [
    ...String(timing)
      .trim()
      .split(/\r?\n\s*\r?\n/),
  ]
    .map((block) =>
      block.trim().match(/^\d+\r?\n([^\r\n]+ --> [^\r\n]+)\r?\n([\s\S]+)$/),
    )
    .filter((cue) => cue !== null)
  if (!cues.length) throw new Error('Speech timestamps unavailable')
  const timingText = cues.map((c) => c[2]).join(' ')
  const compact = (value: string) => value.normalize().replace(/\s+/g, '')
  if (compact(timingText) === compact(text)) return String(timing)
  const lines =
    cues.length === 1
      ? [text]
      : (
          await select(
            'align_captions',
            z.strictObject({ lines: z.array(z.string()).length(cues.length) }),
            'Distribute every word of the accurate transcript, in order, over the supplied timed cues. Copy the wording and language exactly. Return one line per cue.',
            JSON.stringify({
              transcript: text,
              cues: cues.map((c) => [c[1], c[2]]),
            }),
            signal,
            Math.min(14000, Math.max(1400, text.length * 2)),
          )
        ).lines
  if (compact(lines.join('')) !== compact(text)) return String(timing)
  return cues
    .map((cue, index) => `${index + 1}\n${cue[1]}\n${lines[index]}`)
    .join('\n\n')
}
