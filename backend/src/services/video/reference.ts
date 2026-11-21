import { execFile } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { resolve } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { load } from 'cheerio'
import type { AgentChat } from '@/schemas/agent.schema.js'
import { getFile } from '@/services/agent-tools/files.js'
import {
  followPublicResource,
  publicResource,
  publicUrl,
} from '@/services/agent-tools/public-web.js'
import { AppError } from '@/services/error.service.js'
import { videoCodecs } from '@/services/video/codecs.js'
import { productImages } from '@/services/video/product-image.js'

function referenceError() {
  return new AppError('BAD_REQUEST', {
    key: 'so-video-reference',
    message: 'อ่าน reference ไม่ได้ ลองแนบคลิป MP4/WebM หรือใส่ลิงก์ HTTPS สาธารณะ',
  })
}
async function frames(bytes: Buffer, signal: AbortSignal) {
  const { Input, BufferSource, MP4, WEBM, VideoSampleSink } =
    await videoCodecs()
  const input = new Input({
    formats: [MP4, WEBM],
    source: new BufferSource(bytes),
  })
  try {
    const track = await input.getPrimaryVideoTrack()
    if (
      !track ||
      (await track.getDisplayWidth()) * (await track.getDisplayHeight()) >
        9000000
    )
      throw referenceError()
    const duration =
      (await track.getDurationFromMetadata()) ?? (await track.computeDuration())
    if (!Number.isFinite(duration) || duration <= 0 || duration > 300)
      throw referenceError()
    const first = await track.getFirstTimestamp()
    const sink = new VideoSampleSink(track)
    const result: string[] = []
    for (const fraction of [0.15, 0.5, 0.85]) {
      signal.throwIfAborted()
      const sample = await sink.getSample(first + duration * fraction)
      if (!sample) continue
      try {
        const scaled = await sample.transform({
          width: 384,
          height: 216,
          fit: 'contain',
        })
        try {
          const canvas = createCanvas(384, 216)
          const ctx = canvas.getContext('2d')
          const pixels = ctx.createImageData(384, 216)
          await scaled.copyTo(pixels.data, { format: 'RGBA' })
          ctx.putImageData(pixels, 0, 0)
          result.push(canvas.toDataURL('image/jpeg', 0.75))
        } finally {
          scaled.close()
        }
      } finally {
        sample.close()
      }
    }
    if (!result.length) throw referenceError()
    return result
  } finally {
    input.dispose()
  }
}
const integration = resolve('integrations/agent-reach')
function reachPage(url: string, signal: AbortSignal) {
  return new Promise<string>((accept, reject) => {
    const child = execFile(
      resolve(integration, '.venv/bin/python'),
      ['-I', resolve(integration, 'read_reference.py')],
      {
        signal,
        timeout: 11000,
        maxBuffer: 100000,
        env: { LANG: 'en_US.UTF-8' },
      },
      (error, stdout) => {
        if (error) return reject(error)
        try {
          accept(JSON.parse(stdout).text)
        } catch (error) {
          reject(error)
        }
      },
    )
    child.stdin?.on('error', () => {}).end(JSON.stringify({ url }))
  })
}
async function pageReference(value: string, signal: AbortSignal) {
  const url = publicUrl(value)
  if (url.protocol !== 'https:' || !url.hostname.includes('.'))
    throw referenceError()
  for (const { address } of await lookup(url.hostname, { all: true }))
    publicUrl(`https://${address.includes(':') ? `[${address}]` : address}`)
  if (/\.(webm|mp4)$/i.test(url.pathname)) {
    const media = await followPublicResource(url.href, signal)
    if (media.status !== 200) throw referenceError()
    return { text: url.href, images: await frames(media.body, signal) }
  }
  const text = await reachPage(url.href, signal).catch(async () => {
    const isYoutube = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'youtu.be',
    ].includes(url.hostname)
    if (isYoutube) {
      const metadata = await publicResource(
        'https://www.youtube.com/oembed?format=json&url=' +
          encodeURIComponent(url.href),
        signal,
      )
      if (metadata.status !== 200) throw referenceError()
      const { title, author_name } = JSON.parse(metadata.body.toString())
      return [title, author_name].join(' — ')
    }
    const page = await followPublicResource(url.href, signal)
    if (
      page.status !== 200 ||
      !page.headers.get('content-type')?.includes('text/html')
    )
      throw referenceError()
    const doc = load(page.body.toString())
    doc('script,style,nav,noscript').remove()
    return (
      doc('title').text() +
      ' ' +
      doc('body').text().replace(/\s+/g, ' ').trim().slice(0, 6000)
    )
  })
  if (!text?.trim()) throw referenceError()
  return { text, images: [] as string[] }
}
export async function videoReference(
  request: AgentChat,
  userId: string,
  signal: AbortSignal,
) {
  try {
    const reference = request.referenceUrl
      ? await pageReference(
          request.referenceUrl,
          AbortSignal.any([signal, AbortSignal.timeout(20000)]),
        )
      : { text: '', images: [] as string[] }
    if (request.outputFormat !== 'overlay' && request.files?.length) {
      const products = await productImages(userId, request.files, 4)
      reference.images.unshift(
        ...products.map((product) => {
          const scale = Math.min(
            1,
            640 / Math.max(product.width, product.height),
          )
          const canvas = createCanvas(
            Math.max(1, Math.round(product.width * scale)),
            Math.max(1, Math.round(product.height * scale)),
          )
          canvas
            .getContext('2d')
            .drawImage(product, 0, 0, canvas.width, canvas.height)
          return canvas.toDataURL('image/jpeg', 0.88)
        }),
      )
    }
    if (request.referenceFile) {
      const file = await getFile(userId, request.referenceFile)
      reference.images.push(...(await frames(file.bytes, signal)))
    }
    return reference
  } catch (error) {
    if (error instanceof AppError) throw error
    throw referenceError()
  }
}
