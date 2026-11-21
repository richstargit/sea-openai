import type { RequestHandler } from 'express'
import { z } from 'zod'
import { loggedInUser } from '@/controllers/auth.controller.js'
import { StoredFile } from '@/models/agent-storage.model.js'
import { mongo } from '@/models/mongo.js'
import { blenderOnline } from '@/services/video/blender.js'
import {
  connectedOverlayCount,
  overlayOwner,
  overlayRendering,
  publishOverlay,
  queueOverlayMotion,
  rotateOverlay,
} from '@/services/video/overlay.js'
import { videoToolCatalog } from '@/services/video/production.js'
import { saveStyle, skillUpload, videoSkills } from '@/services/video/skills.js'
export const skills: RequestHandler = async (_request, response) => {
  response.json({
    skills: await videoSkills(loggedInUser(response).id),
    blenderOnline: await blenderOnline(),
    videoTools: await videoToolCatalog(),
  })
}
export const addSkill: RequestHandler = async (request, response) => {
  const { markdown } = skillUpload.parse(request.body)
  response
    .status(201)
    .json(await saveStyle(loggedInUser(response).id, markdown))
}
export const overlayStatus: RequestHandler = (_request, response) => {
  const { id } = loggedInUser(response)
  response.json({
    connected: connectedOverlayCount(id),
    rendering: overlayRendering(id),
  })
}
export const overlayLink: RequestHandler = async (_request, response) => {
  response.json({ path: await rotateOverlay(loggedInUser(response).id) })
}
export const overlayPublish: RequestHandler = async (request, response) => {
  response.json(await publishOverlay(loggedInUser(response).id, request.body))
}
export const overlayMotion: RequestHandler = (request, response) => {
  response
    .status(202)
    .json(queueOverlayMotion(loggedInUser(response).id, request.body))
}
export const overlayMedia: RequestHandler = async (request, response) => {
  const owner = await overlayOwner(
    (request.get('authorization') || '').replace(/^Bearer /, ''),
  )
  const file = await mongo(() =>
    StoredFile.findOne(
      { _id: z.uuid().parse(request.params.id), userId: owner.id, video: true },
      'bytes',
    ).lean(),
  )
  if (!file) {
    response.sendStatus(404)
    return
  }
  response
    .set('Cache-Control', 'no-store')
    .type('video/webm')
    .send(Buffer.from(file.bytes.buffer))
}
