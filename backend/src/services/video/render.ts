import {
  createCanvas,
  type Image,
  loadImage,
  type SKRSContext2D,
} from '@napi-rs/canvas'
import { AppError } from '@/services/error.service.js'
import { blenderFrames } from '@/services/video/blender.js'
import { colors, type VideoBrief } from '@/services/video/brief.js'
import { videoCodecs } from '@/services/video/codecs.js'
import { drawPortrait } from '@/services/video/portrait.js'
import { productImage } from '@/services/video/product-image.js'

const fps = 24
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
    const photo = await productImage(userId, files)
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
  const width = overlay ? 768 : 720
  const height = overlay ? 216 : 1280
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  const target = new BufferTarget()
  const output = new Output({ format: new WebMOutputFormat(), target })
  const source = new VideoSampleSource({
    codec: 'vp9',
    bitrate: overlay ? 1400000 : 3600000,
    alpha: overlay ? 'keep' : 'discard',
    latencyMode: 'realtime',
    hardwareAcceleration: 'prefer-software',
  })
  const frameCount = (overlay ? 3 : 6) * fps
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()
  try {
    for (let i = 0; i < frameCount; i++) {
      signal.throwIfAborted()
      ctx.clearRect(0, 0, width, height)
      const image = hero[Math.floor((i / frameCount) * hero.length)] ?? photo
      if (overlay) drawOverlay(ctx, brief, image, i, width, height)
      else drawPortrait(ctx, brief, image, i / fps)
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

function drawOverlay(
  ctx: SKRSContext2D,
  brief: VideoBrief,
  image: Image | undefined,
  i: number,
  width: number,
  height: number,
) {
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
    brief.motion === 'pulse' ? 1 + 0.025 * Math.sin((i / fps) * Math.PI * 2) : 1
  ctx.translate(width / 2, center)
  ctx.scale(scale, scale)
  ctx.translate(-width / 2, -center)
  ctx.fillStyle = '#18283B'
  ctx.beginPath()
  ctx.roundRect(12, center - 92, width - 24, 184, 25)
  ctx.fill()
  ctx.fillStyle = colors[brief.color]
  ctx.fillRect(28, center - 55, 6, 110)

  const textRight = image ? width - 188 : width - 48
  ctx.font = 'bold 44px sans-serif'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(brief.title, 52, center - 1, textRight - 52)
  ctx.font = '28px sans-serif'
  ctx.fillStyle = colors[brief.color]
  ctx.fillText(brief.subtitle, 52, center + 49, textRight - 52)
  if (image) {
    const size = 168
    const ratio = Math.min(size / image.width, size / image.height)
    const x = width - 107
    const y = center
    ctx.drawImage(
      image,
      x - (image.width * ratio) / 2,
      y - (image.height * ratio) / 2,
      image.width * ratio,
      image.height * ratio,
    )
  }
  ctx.restore()
}
