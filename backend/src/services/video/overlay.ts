import { createHash, randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { StoredFile } from '@/models/agent-storage.model.js'
import { Account } from '@/models/auth.model.js'
import { mongo } from '@/models/mongo.js'
import { AppError } from '@/services/error.service.js'

const text = z.string().trim().min(1).max(80)
const image = z
  .string()
  .max(180000)
  .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/)
  .optional()
export const overlayEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('price'),
    sku: text,
    price: z.number().nonnegative().max(999999999),
    image,
  }),
  z.object({ type: z.literal('product'), name: text, image }),
  z.object({ type: z.literal('ingredients'), text, image }),
  z.object({
    type: z.literal('sales'),
    total: z.number().int().nonnegative().max(999999999),
  }),
  z.object({
    type: z.enum(['promo', 'gift', 'flash', 'transition', 'default']),
  }),
  z.object({ type: z.literal('clip'), fileId: z.uuid() }),
])
const clients = new Map<WebSocket, { id: string; hash: string }>()
const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex')
export async function rotateOverlay(userId: string) {
  const token = randomBytes(32).toString('base64url')
  await mongo(() =>
    Account.updateOne(
      { _id: userId },
      { $set: { overlayHash: digest(token) } },
    ),
  )
  for (const [socket, owner] of clients)
    if (owner.id === userId) socket.close(1008, 'Link replaced')
  return `/overlay/#${token}`
}
export async function overlayOwner(token: string) {
  if (!/^[\w-]{43}$/.test(token))
    throw new AppError('UNAUTHORIZED', { key: 'so-overlay-link' })
  const hash = digest(token)
  const account = await mongo(() =>
    Account.findOne({ overlayHash: hash }, '_id').lean(),
  )
  if (!account) throw new AppError('UNAUTHORIZED', { key: 'so-overlay-link' })
  return { id: account._id, hash }
}
export async function publishOverlay(userId: string, body: unknown) {
  const parsed = overlayEvent.safeParse(body)
  const event = parsed.success ? parsed.data : { type: 'default' as const }
  if (
    event.type === 'clip' &&
    !(await mongo(() =>
      StoredFile.exists({ _id: event.fileId, userId, video: true }),
    ))
  )
    throw new AppError('NOT_FOUND', { key: 'so-overlay-clip' })
  const account = await mongo(() =>
    Account.findById(userId, '+overlayHash').lean(),
  )
  let delivered = 0
  for (const [socket, owner] of clients) {
    if (
      owner.id === userId &&
      owner.hash === account?.overlayHash &&
      socket.readyState === WebSocket.OPEN &&
      socket.bufferedAmount < 250000
    ) {
      socket.send(JSON.stringify(event))
      delivered++
    }
  }
  return { type: event.type, delivered }
}
export function attachOverlay(server: Server) {
  const sockets = new WebSocketServer({
    server,
    path: '/overlay/ws',
    maxPayload: 128,
    perMessageDeflate: false,
  })
  sockets.on('connection', (socket) => {
    const expiry = setTimeout(() => socket.terminate(), 5000)
    socket.on('error', () => socket.terminate())
    socket.once('close', () => {
      clearTimeout(expiry)
      clients.delete(socket)
    })
    socket.once('message', async (data) => {
      socket.on('message', () => socket.close(1008))
      try {
        const owner = await overlayOwner(data.toString())
        if (socket.readyState !== WebSocket.OPEN) return
        clearTimeout(expiry)
        clients.set(socket, owner)
        socket.send(JSON.stringify({ type: 'ready' }))
      } catch {
        socket.close(1008)
      }
    })
  })
  return () => {
    for (const socket of sockets.clients) socket.terminate()
    sockets.close()
  }
}
