import { createHash, randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { StoredFile } from '@/models/agent-storage.model.js'
import { Account } from '@/models/auth.model.js'
import { mongo } from '@/models/mongo.js'
import { saveFile } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'
import { logger } from '@/services/logger.service.js'
import { renderOverlayMotion } from '@/services/video/render.js'

const text = z.string().trim().min(1).max(80)
const image = z
  .string()
  .max(180000)
  .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+=*$/)
  .optional()
const unit = z.number().min(0).max(1)
const style = z.enum(['tag', 'sticker', 'receipt', 'flap']).optional()
const fraction = z.number().min(0).max(1)
const frameBox = z
  .object({ x: fraction, y: fraction, w: fraction, h: fraction })
  .refine((box) => box.x + box.w <= 1 && box.y + box.h <= 1)
// small free-form payload for graphics and LiveCut events: short strings, numbers, short lists
const scalar = z.union([z.string().max(160), z.number().finite(), z.boolean()])
const field = z.union([
  scalar,
  z.array(z.union([scalar, z.record(z.string().max(32), scalar)])).max(12),
  z.record(
    z.string().max(32),
    z.union([scalar, z.array(z.string().max(80)).max(12)]),
  ),
])
const fewKeys = (value: object) =>
  Object.keys(value).length <= 24 &&
  Object.keys(value).every((key) => /^[A-Za-z][\w-]{0,31}$/.test(key))
const payload = z.record(z.string(), field).refine(fewKeys)
// LiveCut payloads may also carry an image and a frame box
const livecutPayload = z
  .object({ image, box: frameBox.optional() })
  .catchall(field)
  .refine(fewKeys)
const ttl = z.number().int().min(200).max(120000).optional()
export const overlayEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('price'),
    sku: text,
    price: z.number().nonnegative().max(999999999),
    image,
    style,
  }),
  z.object({ type: z.literal('product'), name: text, image, style }),
  z.object({ type: z.literal('ingredients'), text, image, style }),
  z.object({
    type: z.literal('sales'),
    total: z.number().int().nonnegative().max(999999999),
    style,
  }),
  z.object({
    type: z.enum(['promo', 'gift', 'flash', 'transition', 'default']),
    style,
  }),
  z.object({ type: z.literal('clip'), fileId: z.uuid() }),
  // Lines for the seller to read while live (the live script prompter). The program
  // overlay ignores it; the prompter page shows it. Kept small: a few short lines.
  z.object({
    type: z.literal('prompter'),
    payload: z.object({
      lines: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
      stage: z.string().max(24),
      warning: z.string().max(160).optional(),
    }),
    ttl,
  }),
  z.object({
    type: z.literal('graphic'),
    preset: z.string().regex(/^[a-z0-9-]{1,48}$/),
    data: payload.optional(),
    x: fraction.optional(),
    y: fraction.optional(),
    box: frameBox.optional(),
    image,
    theme: z.enum(['paper', 'ink', 'pop', 'outline']).optional(),
    ttl,
  }),
  // a sound effect on its own, e.g. a director cue without any graphic
  z.object({
    type: z.literal('sound'),
    name: z.string().regex(/^[a-z0-9-]{1,32}$/),
  }),
  // LiveCut director events: { type, payload, ttl }
  z.object({
    type: z.enum([
      'price_pop',
      'price_drop',
      'free_badge',
      'low_stock',
      'product_card',
      'cf_toast',
      'combo',
      'fireworks',
      'poll',
      'caption',
      'crawl',
      'glow',
      'jump_zoom',
      'face_box',
      'theme',
      'zoom',
      'zoom_out',
    ]),
    payload: livecutPayload.optional(),
    ttl,
  }),
  // product pops up at a point in the 1920×1080 frame, e.g. the host's fingertip
  z.object({
    type: z.literal('spotlight'),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    image: image.unwrap(),
    name: text.optional(),
    price: z.number().nonnegative().max(999999999).optional(),
    motion: z.enum(['pop', 'bubble', 'rise', 'flip']).optional(),
    // optional area to frame, e.g. a grid cell picked by a Decisions API choice
    box: z
      .object({ x: unit, y: unit, w: unit, h: unit })
      .refine((box) => box.x + box.w <= 1 && box.y + box.h <= 1)
      .optional(),
  }),
])
const motionEvent = z.discriminatedUnion('type', [
  overlayEvent.options[0],
  overlayEvent.options[1],
  overlayEvent.options[2],
  overlayEvent.options[3],
])
const rendering = new Set<string>()
export const overlayRendering = (userId: string) => rendering.has(userId)
const money = new Intl.NumberFormat('th-TH')
function motionCopy(event: z.infer<typeof motionEvent>) {
  switch (event.type) {
    case 'price':
      return { title: `฿${money.format(event.price)}`, subtitle: event.sku }
    case 'product':
      return { title: event.name, subtitle: 'สินค้า' }
    case 'ingredients':
      return { title: event.text, subtitle: 'ส่วนผสม' }
    case 'sales':
      return { title: money.format(event.total), subtitle: 'ยอดขาย' }
  }
}
// Non-urgent events: design a fresh HyperFrames motion, then push it as a clip when ready.
export function queueOverlayMotion(userId: string, body: unknown) {
  const parsed = motionEvent.safeParse(body)
  if (!parsed.success)
    throw new AppError('BAD_REQUEST', {
      key: 'so-overlay-event',
      details: parsed.error.flatten(),
    })
  if (rendering.has(userId))
    throw new AppError('CONFLICT', { key: 'so-overlay-motion-busy' })
  const event = parsed.data
  const { title, subtitle } = motionCopy(event)
  const image = 'image' in event ? event.image : undefined
  rendering.add(userId)
  void (async () => {
    try {
      const bytes = await renderOverlayMotion(
        {
          title: title.slice(0, 56),
          subtitle,
          color: 'gold',
          motion: 'slide',
          subject: 'none',
          format: 'overlay',
        },
        AbortSignal.timeout(300_000),
        image ? Buffer.from(image.split(',')[1] ?? '', 'base64') : undefined,
      )
      const file = await saveFile(
        userId,
        'overlay.webm',
        bytes,
        undefined,
        true,
      )
      await publishOverlay(userId, { type: 'clip', fileId: file.id })
    } catch (error) {
      logger.error('OVERLAY_MOTION_FAILED', error, { userId })
    } finally {
      rendering.delete(userId)
    }
  })()
  return { queued: true }
}
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
export function connectedOverlayCount(userId: string) {
  let count = 0
  for (const [socket, owner] of clients)
    if (owner.id === userId && socket.readyState === WebSocket.OPEN) count++
  return count
}
export async function publishOverlay(userId: string, body: unknown) {
  const parsed = overlayEvent.safeParse(body)
  if (!parsed.success)
    throw new AppError('BAD_REQUEST', {
      key: 'so-overlay-event',
      details: parsed.error.flatten(),
    })
  const event = parsed.data
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
      } catch (error) {
        if (error instanceof AppError && error.codeName === 'UNAUTHORIZED')
          socket.close(1008, 'Invalid overlay link')
        else socket.close(1013, 'Try again later')
      }
    })
  })
  return () => {
    for (const socket of sockets.clients) socket.terminate()
    sockets.close()
  }
}
