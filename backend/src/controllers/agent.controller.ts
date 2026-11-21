import type { RequestHandler, Response } from 'express'
import { z } from 'zod'
import { loggedInUser } from '@/controllers/auth.controller.js'
import {
  type ActiveThread,
  claimThread,
  createThread,
  readThread,
  threadView,
} from '@/models/agent-thread.model.js'
import { agentChatSchema, agentMessageSchema } from '@/schemas/agent.schema.js'
import { runAgent } from '@/services/agent.service.js'
import { readRunProgress, runThread } from '@/services/agent-thread.service.js'
import { checkAttachments } from '@/services/agent-tools/files.js'

export const chat: RequestHandler = async (request, response) => {
  const input = agentChatSchema.parse(request.body)
  const { id: userId } = loggedInUser(response)
  await checkAttachments(userId, [
    ...(input.files ?? []),
    ...(input.referenceFile ? [input.referenceFile] : []),
  ])
  const result = await runAgent(input, userId)
  response.json({ success: true, ...result })
}

async function streamThread(response: Response, thread: ActiveThread) {
  response.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    'X-Accel-Buffering': 'no',
  })
  response.flushHeaders()
  const ping = setInterval(() => response.write(': ping\n\n'), 15_000)
  ping.unref()
  response.once('close', () => clearInterval(ping))

  try {
    await runThread(thread, (event) => {
      if (!response.destroyed) {
        response.write(
          `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        )
      }
    })
  } finally {
    clearInterval(ping)
    if (!response.destroyed) response.end()
  }
}

const threadId = z.uuid()

export const startThread: RequestHandler = async (request, response) => {
  const { id: userId } = loggedInUser(response)
  const input = agentMessageSchema.parse(request.body)
  await checkAttachments(userId, [
    ...(input.files ?? []),
    ...(input.referenceFile ? [input.referenceFile] : []),
  ])
  const thread = await createThread(userId, input)
  await streamThread(response, thread)
}

export const showThread: RequestHandler = async (request, response) => {
  const thread = await readThread(
    loggedInUser(response).id,
    threadId.parse(request.params.id),
  )
  const progress = await readRunProgress(thread.userId, thread.run.id)
  response
    .set('Cache-Control', 'no-store')
    .json({ success: true, thread: threadView(thread, progress) })
}

export const postThreadMessage: RequestHandler = async (request, response) => {
  const id = threadId.parse(request.params.id)
  const { id: userId } = loggedInUser(response)
  const input = agentMessageSchema.parse(request.body)
  await checkAttachments(userId, [
    ...(input.files ?? []),
    ...(input.referenceFile ? [input.referenceFile] : []),
  ])
  const thread = await claimThread(userId, id, input)
  await streamThread(response, thread)
}

export const resumeThread: RequestHandler = async (request, response) => {
  const thread = await claimThread(
    loggedInUser(response).id,
    threadId.parse(request.params.id),
  )
  await streamThread(response, thread)
}
