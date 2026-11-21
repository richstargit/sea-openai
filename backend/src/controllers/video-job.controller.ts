import path from 'node:path'

import type { RequestHandler, Response } from 'express'
import { z } from 'zod'

import { loggedInUser } from '@/controllers/auth.controller.js'
import { imageUrl } from '@/controllers/hook-machine.controller.js'
import { AppError } from '@/services/error.service.js'
import { aiConfigured } from '@/services/hook-machine/ai.js'
import { readDoc } from '@/services/hook-machine/store.js'
import type { Profile } from '@/services/hook-machine/types.js'
import { parsePublicUrl } from '@/services/hook-machine/url.js'
import {
  comboProblem,
  DEFAULT_LANGUAGE,
  DEFAULT_MODEL,
  DEFAULT_VOICE,
} from '@/services/hook-machine/voice/catalog.js'
import {
  deleteVideoFully,
  isVideoRunning,
  ownedVideo,
  ownedVideos,
  startVideoJob,
  VideoBusyError,
  videoFilePath,
} from '@/services/video-job/job.js'
import {
  toVideoJob,
  VIDEO_DURATIONS,
  VOICE_LANGUAGES,
} from '@/services/video-job/types.js'

const KEY = 'so-video-job'

const uid = (res: Response): string => loggedInUser(res).id

const bad = (key: string, message: string, messageTH: string) =>
  new AppError('BAD_REQUEST', { key: `${KEY}-${key}`, message, messageTH })

// Someone else's video answers 404, never 403, so ids cannot be probed.
const notFound = () => new AppError('NOT_FOUND', { key: `${KEY}-not-found` })

export const createVideoBody = z.object({
  profileId: z.uuid(),
  brief: z.string().trim().max(4000).default(''),
  images: z.array(imageUrl).max(4).default([]),
  productUrl: z.string().trim().max(2000).optional(),
  durationSec: z.union([
    z.literal(VIDEO_DURATIONS[0]),
    z.literal(VIDEO_DURATIONS[1]),
    z.literal(VIDEO_DURATIONS[2]),
    z.literal(VIDEO_DURATIONS[3]),
  ]),
  voice: z
    .object({
      language: z.enum(VOICE_LANGUAGES).default(DEFAULT_LANGUAGE as 'en'),
      model: z.string().optional(),
      voice: z.string().optional(),
    })
    .optional(),
})

export const createVideo: RequestHandler = async (req, res) => {
  const body = createVideoBody.parse(req.body)
  const ownerId = uid(res)

  const profile = await readDoc<Profile>('profiles', body.profileId)
  if (!profile || profile.ownerId !== ownerId) {
    throw new AppError('NOT_FOUND', { key: `${KEY}-profile-not-found` })
  }
  if (profile.status !== 'ready' || !profile.insights) {
    throw bad(
      'profile-not-ready',
      'Analyze the style first.',
      'ต้องวิเคราะห์สไตล์ให้เสร็จก่อน',
    )
  }
  if (body.images.length === 0 && !body.brief) {
    throw bad(
      'empty-video',
      'Add a photo or write a brief.',
      'ใส่รูปหรือเขียนรายละเอียดก่อนสร้างวิดีโอ',
    )
  }
  let productUrl: string | null = null
  if (body.productUrl) {
    productUrl = parsePublicUrl(body.productUrl)
    if (!productUrl) {
      throw bad(
        'bad-product-url',
        'Product link must be a public http(s) address.',
        'ลิงก์สินค้าต้องเป็นเว็บสาธารณะ (http/https)',
      )
    }
  }

  const voice = {
    language: body.voice?.language ?? DEFAULT_LANGUAGE,
    model: body.voice?.model ?? DEFAULT_MODEL,
    voice: body.voice?.voice ?? DEFAULT_VOICE,
  }
  const problem = comboProblem(voice.model, voice.voice)
  if (problem) {
    throw bad('voice-combo', problem, 'โมเดลกับเสียงที่เลือกใช้ด้วยกันไม่ได้')
  }
  if (!aiConfigured()) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: `${KEY}-no-ai`,
      message:
        'Set OPENAI_API_KEY (or HOOK_MACHINE_MOCK_AI=true for the demo).',
      messageTH: 'ตอนนี้ยังสร้างวิดีโอไม่ได้ ระบบ AI ยังไม่พร้อม',
    })
  }

  try {
    const video = await startVideoJob({
      ownerId,
      profile,
      brief: body.brief,
      images: body.images,
      productUrl,
      durationSec: body.durationSec,
      voice,
    })
    res.status(202).json({ success: true, video: toVideoJob(video) })
  } catch (error) {
    if (error instanceof VideoBusyError) {
      throw error.reason === 'owner'
        ? new AppError('CONFLICT', {
            key: `${KEY}-already-running`,
            message: 'A video is already being made.',
            messageTH: 'กำลังสร้างวิดีโอก่อนหน้าอยู่ รอให้เสร็จก่อน',
          })
        : new AppError('SERVICE_UNAVAILABLE', {
            key: `${KEY}-capacity`,
            message: 'Too many videos are being made right now.',
            messageTH: 'ตอนนี้มีคนสร้างวิดีโอเยอะ ลองใหม่ในอีกสักครู่',
          })
    }
    throw error
  }
}

export const listVideos: RequestHandler = async (_req, res) => {
  const videos = await ownedVideos(uid(res), 30)
  res.json({ success: true, videos: videos.map(toVideoJob) })
}

export const getVideo: RequestHandler = async (req, res) => {
  const video = await ownedVideo(String(req.params.id), uid(res))
  if (!video) throw notFound()
  res.json({ success: true, video: toVideoJob(video) })
}

export const videoFile: RequestHandler = async (req, res) => {
  const video = await ownedVideo(String(req.params.id), uid(res))
  const file = video?.status === 'ready' ? videoFilePath(video.id) : null
  if (!video || !file) throw notFound()

  const name = `livecut-${video.id.slice(0, 8)}-ai-voice.mp4`
  const disposition = req.query.download === '1' ? 'attachment' : 'inline'
  // sendFile answers Range requests (206) and sets Accept-Ranges and ETag.
  res.sendFile(
    path.resolve(file),
    {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `${disposition}; filename="${name}"`,
        // The voice is synthetic speech, and the file says so.
        'X-AI-Generated-Voice': 'true',
        // The page is on another origin and plays this with a plain video element.
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'private, max-age=300',
      },
      dotfiles: 'deny',
    },
    (error) => {
      if (!error || res.headersSent) return
      // A range outside the file is the client's mistake (416), anything else is a missing file.
      const failure = error as {
        status?: number
        headers?: Record<string, string>
      }
      if (failure.status === 416) {
        if (failure.headers) res.set(failure.headers)
        res.status(416).json({ success: false })
        return
      }
      res.status(404).json({ success: false })
    },
  )
}

export const deleteVideo: RequestHandler = async (req, res) => {
  const video = await ownedVideo(String(req.params.id), uid(res))
  if (!video) throw notFound()
  if (video.status === 'running' || isVideoRunning(video.id)) {
    throw new AppError('CONFLICT', {
      key: `${KEY}-running`,
      message: 'Wait for the video to finish before deleting it.',
      messageTH: 'รอให้วิดีโอสร้างเสร็จก่อนจึงลบได้',
    })
  }
  await deleteVideoFully(video)
  res.json({ success: true })
}
