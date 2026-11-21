import type { RequestHandler } from 'express'
import { z } from 'zod'
import { loggedInUser } from '@/controllers/auth.controller.js'
import { filename, getFile, saveFile } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'

export const uploadAgentFile: RequestHandler = async (request, response) => {
  const name = filename.parse(request.query.name)
  if (!Buffer.isBuffer(request.body))
    throw new AppError('BAD_REQUEST', {
      key: 'so-agent-file-upload',
      message: 'Send file bytes as application/octet-stream',
    })
  const file = await saveFile(loggedInUser(response).id, name, request.body)
  response.status(201).json({ file })
}

export const downloadAgentFile: RequestHandler = async (request, response) => {
  const id = z.uuid().parse(request.params.id)
  const file = await getFile(loggedInUser(response).id, id)
  response
    .set('Cache-Control', 'no-store')
    .attachment(file.name)
    .type(file.video ? 'video/webm' : 'application/octet-stream')
    .send(file.bytes)
}
