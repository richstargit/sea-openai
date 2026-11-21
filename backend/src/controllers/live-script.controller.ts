import type { RequestHandler, Response } from 'express'
import { z } from 'zod'

import { loggedInUser } from '@/controllers/auth.controller.js'
import { imageUrl } from '@/controllers/hook-machine.controller.js'
import { AppError } from '@/services/error.service.js'
import { readDoc } from '@/services/hook-machine/store.js'
import type { Profile } from '@/services/hook-machine/types.js'
import { parsePublicUrl } from '@/services/hook-machine/url.js'
import { aiConfigured, aiIsMocked } from '@/services/live-script/ai.js'
import { styleContext } from '@/services/live-script/generate.js'
import { LIVE_PRINCIPLES } from '@/services/live-script/rubric.js'
import {
  LIVE_LANGUAGES,
  LIVE_MINUTES,
  MAX_COMMENT_CHARS,
  offerSchema,
  replyBody,
} from '@/services/live-script/schemas.js'
import {
  deleteShow,
  listShowsFor,
  replyFor,
  ShowBusyError,
  showFor,
  startShow,
  toShow,
} from '@/services/live-script/service.js'

export { replyBody }

const KEY = 'so-live-script'

const uid = (res: Response): string => loggedInUser(res).id

const bad = (key: string, message: string, messageTH: string) =>
  new AppError('BAD_REQUEST', { key: `${KEY}-${key}`, message, messageTH })

export const createShowBody = z.object({
  profileId: z.uuid().optional(),
  brief: z.string().trim().max(4000).default(''),
  images: z.array(imageUrl).max(4).default([]),
  productUrl: z.string().trim().max(2000).optional(),
  offer: offerSchema.default({
    price: '',
    promotion: '',
    stock: '',
    endsAt: '',
  }),
  minutes: z.union([
    z.literal(LIVE_MINUTES[0]),
    z.literal(LIVE_MINUTES[1]),
    z.literal(LIVE_MINUTES[2]),
    z.literal(LIVE_MINUTES[3]),
  ]),
  language: z.enum(LIVE_LANGUAGES).default('th'),
})
export type CreateShowBody = z.infer<typeof createShowBody>

export const options: RequestHandler = (_req, res) => {
  res.json({
    success: true,
    ai: aiConfigured(),
    mockAi: aiIsMocked(),
    languages: LIVE_LANGUAGES,
    minutes: LIVE_MINUTES,
    maxImages: 4,
    maxCommentChars: MAX_COMMENT_CHARS,
    principles: LIVE_PRINCIPLES,
  })
}

export const createShow: RequestHandler = async (req, res) => {
  const body = createShowBody.parse(req.body)
  const ownerId = uid(res)

  if (body.images.length === 0 && !body.brief) {
    throw bad(
      'empty',
      'Add a photo or write a brief.',
      'ใส่รูปหรือเขียนรายละเอียดสินค้าก่อน',
    )
  }
  let productUrl: string | null = null
  if (body.productUrl) {
    productUrl = parsePublicUrl(body.productUrl)
    if (!productUrl) {
      throw bad(
        'bad-product-url',
        'Product link must be a public http(s) address.',
        'ลิงก์สินค้าต้องเป็นเว็บสาธารณะ (http หรือ https)',
      )
    }
  }

  let profile: Parameters<typeof startShow>[0]['profile'] = null
  if (body.profileId) {
    const found = await readDoc<Profile>('profiles', body.profileId)
    // Someone else's style reads as missing, the same as in the Hook Machine.
    if (!found || found.ownerId !== ownerId) {
      throw new AppError('NOT_FOUND', { key: `${KEY}-profile-not-found` })
    }
    const style = found.status === 'ready' ? styleContext(found) : null
    if (!style) {
      throw bad(
        'profile-not-ready',
        'Analyze the style first.',
        'ต้องวิเคราะห์สไตล์ให้เสร็จก่อน',
      )
    }
    profile = { id: found.id, name: found.name, style }
  }
  if (!aiConfigured()) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: `${KEY}-no-ai`,
      message: 'Set OPENAI_API_KEY (or HOOK_MACHINE_MOCK_AI=true for the demo).',
      messageTH: 'ตอนนี้ยังสร้างบทพูดไม่ได้ ระบบ AI ยังไม่พร้อม',
    })
  }

  try {
    const doc = await startShow({
      ownerId,
      profile,
      brief: body.brief,
      images: body.images,
      productUrl,
      offer: body.offer,
      minutes: body.minutes,
      language: body.language,
    })
    res.status(202).json({ success: true, show: toShow(doc) })
  } catch (error) {
    if (error instanceof ShowBusyError) {
      throw error.reason === 'owner'
        ? new AppError('CONFLICT', {
            key: `${KEY}-already-running`,
            message: 'A show is already being written.',
            messageTH: 'กำลังเขียนบทพูดก่อนหน้าอยู่ รอให้เสร็จก่อน',
          })
        : new AppError('SERVICE_UNAVAILABLE', {
            key: `${KEY}-capacity`,
            message: 'Too many shows are being written right now.',
            messageTH: 'ตอนนี้มีคนเขียนบทพูดเยอะ ลองใหม่ในอีกสักครู่',
          })
    }
    throw error
  }
}

export const listShows: RequestHandler = async (_req, res) => {
  const shows = await listShowsFor(uid(res))
  res.json({ success: true, shows: shows.map(toShow) })
}

export const getShow: RequestHandler = async (req, res) => {
  const doc = await showFor(uid(res), String(req.params.id))
  res.json({ success: true, show: toShow(doc) })
}

export const removeShow: RequestHandler = async (req, res) => {
  await deleteShow(uid(res), String(req.params.id))
  res.json({ success: true })
}

export const replyToComment: RequestHandler = async (req, res) => {
  const { comment } = replyBody.parse(req.body)
  const reply = await replyFor(uid(res), String(req.params.id), comment)
  res.json({ success: true, reply })
}
