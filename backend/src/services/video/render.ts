import { createCanvas, type Image, loadImage } from '@napi-rs/canvas'
import { getFile } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'
import { blenderFrames } from '@/services/video/blender.js'
import { colors, type VideoBrief } from '@/services/video/brief.js'

import { videoCodecs } from '@/services/video/codecs.js'

async function attachment(userId: string, files: string[]) {
  const [file] = files
  if (!file) return
  const { bytes } = await getFile(userId, file)
  if (
    files.length !== 1 ||
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 12000000
  )
    throw new AppError('BAD_REQUEST', {
      key: 'so-video-image',
      message: 'แนบภาพ PNG หนึ่งภาพ ขนาดไม่เกิน 12 ล้านพิกเซล',
    })
  return loadImage(bytes)
}
let active = 0
export async function renderVideo(
  brief: VideoBrief,
  signal: AbortSignal,
  userId: string,
  files: string[] = [],
) {
  if (active >= 2)
    throw new AppError('SERVICE_UNAVAILABLE', { key: 'so-video-render-busy' })
  active++
  try {
    const photo = await attachment(userId, files)
    const hero =
      brief.subject === 'none'
        ? []
        : await Promise.all(
            (await blenderFrames(brief, signal)).map((bytes) =>
              loadImage(bytes),
            ),
          )
    return await encodeShot(brief, signal, photo, hero)
  } finally {
    active--
  }
}
async function encodeShot(
  brief: VideoBrief,
  signal: AbortSignal,
  photo: Image | undefined,
  hero: Image[],
) {
  const {
    BufferTarget,
    Output,
    WebMOutputFormat,
    VideoSampleSource,
    VideoSample,
  } = await videoCodecs()
  const overlay = brief.format === 'overlay'
  const width = overlay ? 768 : 540
  const height = overlay ? 216 : 960
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const target = new BufferTarget()
  const output = new Output({ format: new WebMOutputFormat(), target })
  const source = new VideoSampleSource({
    codec: 'vp9',
    bitrate: 1400000,
    alpha: overlay ? 'keep' : 'discard',
    latencyMode: 'realtime',
    hardwareAcceleration: 'prefer-software',
  })
  const fps = 24
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()
  try {
    for (let i = 0; i < 3 * fps; i++) {
      signal.throwIfAborted()
      ctx.clearRect(0, 0, width, height)
      if (!overlay) {
        ctx.fillStyle = '#101C2B'
        ctx.fillRect(0, 0, width, height)
      }
      const entrance = Math.min(1, i / 8, (71 - i) / 8)
      ctx.save()
      ctx.globalAlpha = entrance
      ctx.translate(brief.motion === 'slide' ? (entrance - 1) * 70 : 0, 0)
      if (brief.motion === 'wipe') {
        ctx.beginPath()
        ctx.rect(0, 0, width * entrance, height)
        ctx.clip()
      }
      const center = height / 2
      const scale =
        brief.motion === 'pulse'
          ? 1 + 0.025 * Math.sin((i / fps) * Math.PI * 2)
          : 1
      ctx.translate(width / 2, center)
      ctx.scale(scale, scale)
      ctx.translate(-width / 2, -center)
      ctx.fillStyle = '#18283B'
      ctx.beginPath()
      ctx.roundRect(12, center - 92, width - 24, 184, 25)
      ctx.fill()
      ctx.fillStyle = colors[brief.color]
      ctx.fillRect(28, center - 55, 6, 110)
      const image = hero[Math.floor(i / 3)] ?? photo
      const textRight = image && overlay ? width - 188 : width - 48
      ctx.font = 'bold 44px sans-serif'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(brief.title, 52, center - 1, textRight - 52)
      ctx.font = '28px sans-serif'
      ctx.fillStyle = colors[brief.color]
      ctx.fillText(brief.subtitle, 52, center + 49, textRight - 52)
      if (image) {
        const size = overlay ? 168 : 290
        const ratio = Math.min(size / image.width, size / image.height)
        const x = overlay ? width - 107 : width / 2
        const y = overlay ? center : center - 246
        ctx.drawImage(
          image,
          x - (image.width * ratio) / 2,
          y - (image.height * ratio) / 2,
          image.width * ratio,
          image.height * ratio,
        )
      }
      ctx.restore()
      const sample = new VideoSample(
        ctx.getImageData(0, 0, width, height).data,
        {
          format: 'RGBA',
          codedWidth: width,
          codedHeight: height,
          timestamp: i / fps,
          duration: 1 / fps,
        },
      )
      try {
        await source.add(sample)
      } finally {
        sample.close()
      }
    }
    await output.finalize()
    if (!target.buffer) throw new Error('Missing encoded video')
    return Buffer.from(target.buffer)
  } catch (error) {
    await output.cancel()
    throw error
  }
}
