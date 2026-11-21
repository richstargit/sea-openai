import { toFile } from 'openai'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import type { LanguageInfo } from '@/services/hook-machine/voice/catalog.js'
import { withRetry } from '@/services/hook-machine/voice/provider.js'
import {
  compositeScore,
  errorRate,
  intelligibilityScore,
  pacingScore,
  styleScoreFromJudge,
  technicalScore,
  waveStats,
} from '@/services/hook-machine/voice/scoring.js'
import { parseWav } from '@/services/hook-machine/voice/wav.js'
import { sharedOpenAIClient } from '@/services/openai.service.js'

export type VoiceScores = {
  total: number
  intelligibility: number | null
  pacing: number
  style: number | null
  technical: number
  reason: string | null
  details: {
    errorRate: number | null
    rate: number
    rateUnit: 'words' | 'chars'
    durationSec: number
    silenceRatio: number
    clipRatio: number
  }
}

export type ScoreInput = {
  wav: Buffer
  spokenText: string
  language: LanguageInfo
  targetSec: number
  productName: string | null
  /** The instruction block the take was generated with, for the AI judge. */
  styleBrief: string
  /** Position of the take, only used to vary demo scores. */
  index: number
}

const TRANSCRIBE_FALLBACK = 'gpt-4o-mini-transcribe'

async function transcribe(
  wav: Buffer,
  language: LanguageInfo,
  productName: string | null,
): Promise<string | null> {
  const client = sharedOpenAIClient().withOptions({
    maxRetries: 0,
    timeout: 120_000,
  })
  const keywords = productName ? [productName.slice(0, 80)] : []
  const attempts: { model: string; extra: Record<string, unknown> }[] = [
    {
      model: hookMachineConfig.voiceTranscribeModel,
      extra: {
        languages: [language.code],
        ...(keywords.length ? { keywords } : {}),
      },
    },
    {
      model: TRANSCRIBE_FALLBACK,
      extra: {
        language: language.code,
        ...(productName ? { prompt: productName } : {}),
      },
    },
  ]
  for (const { model, extra } of attempts) {
    try {
      const result = await withRetry(async () =>
        client.audio.transcriptions.create({
          file: await toFile(wav, 'take.wav', { type: 'audio/wav' }),
          model: model as 'gpt-transcribe',
          ...extra,
        } as Parameters<typeof client.audio.transcriptions.create>[0]),
      )
      const text = (result as { text?: string }).text
      if (typeof text === 'string') return text
    } catch {
      // Try the next model.
    }
  }
  return null
}

/** Asks an audio model to rate delivery. Returns null when it cannot, so the score drops this part. */
async function judge(
  wav: Buffer,
  styleBrief: string,
  language: LanguageInfo,
): Promise<{ style: number; reason: string } | null> {
  try {
    const client = sharedOpenAIClient().withOptions({
      maxRetries: 1,
      timeout: 120_000,
    })
    const response = await withRetry(() =>
      client.chat.completions.create({
        model: hookMachineConfig.voiceJudgeModel,
        modalities: ['text'],
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `You are rating one voiceover take for a short product video. The requested delivery was:
${styleBrief}

Listen to the clip and rate it. Answer with JSON only, no other text:
{"fit": 1 to 5 for how well the delivery matches the requested style, "natural": 1 to 5 for how natural and human it sounds (5 is indistinguishable from a skilled human), "reason": one short sentence in Thai on what you heard, no quotation marks and no dashes}
The spoken language should be ${language.name}.`,
              },
              {
                type: 'input_audio',
                input_audio: { data: wav.toString('base64'), format: 'wav' },
              },
            ],
          },
        ],
      }),
    )
    const raw = response.choices[0]?.message?.content ?? ''
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as {
      fit?: number
      natural?: number
      reason?: string
    }
    if (typeof parsed.fit !== 'number' || typeof parsed.natural !== 'number')
      return null
    const fit = Math.min(5, Math.max(1, parsed.fit))
    const natural = Math.min(5, Math.max(1, parsed.natural))
    return {
      style: styleScoreFromJudge(fit, natural),
      reason: String(parsed.reason ?? '')
        .replace(/["“”]/g, '')
        .trim(),
    }
  } catch {
    return null
  }
}

export async function scoreTake(input: ScoreInput): Promise<{
  scores: VoiceScores
  transcript: string | null
  durationSec: number
}> {
  const wav = parseWav(input.wav)
  const { silenceRatio, clipRatio } = waveStats(wav)
  const technical = technicalScore(silenceRatio, clipRatio)
  const pace = pacingScore({
    text: input.spokenText,
    durationSec: wav.durationSec,
    targetSec: input.targetSec,
    language: input.language,
  })

  let transcript: string | null
  let intelligibility: number | null
  let rate: number | null
  let style: number | null
  let reason: string | null

  if (hookMachineConfig.mockAi) {
    // Demo mode: believable numbers that differ per take, no API calls.
    transcript = input.spokenText
    rate = 0.02 * (input.index + 1)
    intelligibility = intelligibilityScore(rate)
    style = Math.max(40, 92 - input.index * 9)
    reason = 'ข้อมูลตัวอย่างจากโหมดเดโม ไม่ได้มาจากการฟังจริง'
  } else {
    transcript = await transcribe(input.wav, input.language, input.productName)
    rate =
      transcript === null
        ? null
        : errorRate(input.spokenText, transcript, input.language)
    intelligibility = rate === null ? null : intelligibilityScore(rate)
    const verdict = await judge(input.wav, input.styleBrief, input.language)
    style = verdict?.style ?? null
    reason = verdict?.reason ?? null
  }

  const scores: VoiceScores = {
    total: compositeScore({
      intelligibility,
      pacing: pace.score,
      style,
      technical,
    }),
    intelligibility,
    pacing: pace.score,
    style,
    technical,
    reason,
    details: {
      errorRate: rate === null ? null : Math.round(rate * 1000) / 1000,
      rate: pace.rate,
      rateUnit: input.language.unit,
      durationSec: Math.round(wav.durationSec * 10) / 10,
      silenceRatio: Math.round(silenceRatio * 1000) / 1000,
      clipRatio: Math.round(clipRatio * 100_000) / 100_000,
    },
  }
  return { scores, transcript, durationSec: wav.durationSec }
}
