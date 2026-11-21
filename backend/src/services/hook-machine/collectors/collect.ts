import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import {
  type VideoMeta,
  youtubeMeta,
  youtubeSubtitle,
} from '@/services/hook-machine/collectors/agent-reach.js'
import {
  extractAudio,
  hookFrames,
  type Pacing,
  pacing,
} from '@/services/hook-machine/collectors/media.js'
import {
  canTranscribe,
  transcribeAudio,
} from '@/services/hook-machine/collectors/transcribe.js'
import {
  ytdlpDownload,
  ytdlpMeta,
  ytdlpSubtitles,
} from '@/services/hook-machine/collectors/ytdlp.js'
import type { Platform } from '@/services/hook-machine/url.js'

export type Collected = {
  meta: VideoMeta
  transcript: string
  transcriptSource: 'captions' | 'whisper' | 'none'
  frames: { second: number; dataUrl: string }[]
  pacing: Pacing | null
  /** Which tool produced each part, shown to the user for transparency. */
  via: string[]
  warnings: string[]
}

const EMPTY_META: VideoMeta = {
  title: null,
  author: null,
  publishedAt: null,
  description: null,
  durationSec: null,
  views: null,
  likes: null,
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Agent-Reach reads YouTube natively. It has no per-post TikTok or Instagram
 * reader, so those fall back to yt-dlp (the engine Agent-Reach itself uses for
 * YouTube). The result shape is the same either way.
 */
export async function collectSource(
  url: string,
  platform: Platform,
  report: (step: string) => Promise<void>,
): Promise<Collected> {
  const via: string[] = []
  const warnings: string[] = []
  const workDir = path.join(hookMachineConfig.tmpDir, crypto.randomUUID())
  await mkdir(workDir, { recursive: true })

  try {
    await report('ดึงข้อมูลคลิป')
    let meta = EMPTY_META
    if (platform === 'youtube') {
      try {
        meta = await youtubeMeta(url)
        via.push('agent-reach:youtube')
      } catch (error) {
        warnings.push(
          `Agent-Reach อ่านข้อมูลไม่ได้ (${reason(error)}) ใช้ yt-dlp แทน`,
        )
      }
    }
    if (via.length === 0) {
      meta = await ytdlpMeta(url)
      via.push('yt-dlp')
    }

    let transcript = ''
    let transcriptSource: Collected['transcriptSource'] = 'none'

    await report('ดึงคำบรรยายของคลิป')
    try {
      if (platform === 'youtube') {
        transcript = await youtubeSubtitle(url)
        if (transcript) via.push('agent-reach:subtitle')
      }
      if (!transcript) {
        transcript = await ytdlpSubtitles(url, workDir)
        if (transcript) via.push('yt-dlp:subtitles')
      }
    } catch (error) {
      warnings.push(`ดึงคำบรรยายไม่ได้ (${reason(error)})`)
    }
    if (transcript) transcriptSource = 'captions'

    await report('ดาวน์โหลดช่วงเปิดคลิป')
    let frames: Collected['frames'] = []
    let pace: Pacing | null = null
    try {
      const video = await ytdlpDownload(url, workDir)
      via.push('yt-dlp:video')
      frames = await hookFrames(video, workDir)
      pace = await pacing(video)
      if (frames.length) via.push('ffmpeg:hook-microscope')

      if (!transcript) {
        if (canTranscribe() && !hookMachineConfig.mockAi) {
          await report('ถอดเสียงด้วย Whisper')
          transcript = await transcribeAudio(await extractAudio(video, workDir))
          transcriptSource = 'whisper'
          via.push('openai:transcribe')
        } else {
          warnings.push(
            'คลิปนี้ไม่มีคำบรรยาย และยังไม่ได้ตั้ง OPENAI_API_KEY สำหรับถอดเสียง',
          )
        }
      }
    } catch (error) {
      warnings.push(`โหลดวิดีโอไม่ได้ (${reason(error)}) วิเคราะห์จากข้อความอย่างเดียว`)
    }

    return {
      meta,
      transcript: transcript.slice(0, 6000),
      transcriptSource,
      frames,
      pacing: pace,
      via,
      warnings,
    }
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
