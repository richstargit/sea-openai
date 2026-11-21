import {
  createCanvas,
  type Image,
  loadImage,
  type SKRSContext2D,
} from '@napi-rs/canvas'
import { FILE_LIMIT } from '@/services/agent-tools/files.js'
import { createVideoMedia } from '@/services/agent-tools/video-media.js'
import { AppError } from '@/services/error.service.js'
import { blenderFrames } from '@/services/video/blender.js'
import { colors, type VideoBrief } from '@/services/video/brief.js'
import { videoCodecs } from '@/services/video/codecs.js'
import { renderMotion } from '@/services/video/hyperframes.js'
import {
  drawPortrait,
  filmFps as fps,
  portraitTimeline,
} from '@/services/video/portrait.js'
import { productImages, productPng } from '@/services/video/product-image.js'
import {
  directScenes,
  drawScene,
  type FilmScene,
} from '@/services/video/scene.js'

const sampleRate = 24000
let active = 0
export async function withVideoCapacity<T>(work: () => Promise<T>) {
  if (active >= 2)
    throw new AppError('SERVICE_UNAVAILABLE', { key: 'so-video-render-busy' })
  active++
  try {
    return await work()
  } finally {
    active--
  }
}
export const renderOverlayMotion = (
  brief: VideoBrief,
  signal: AbortSignal,
  product?: Buffer,
) => withVideoCapacity(() => renderMotion(brief, signal, undefined, product))
export function renderVideo(
  brief: VideoBrief,
  signal: AbortSignal,
  userId: string,
  files: string[] = [],
  runId?: string,
) {
  return withVideoCapacity(async () => {
    const portrait = brief.format === 'portrait'
    const media =
      portrait && brief.media
        ? await createVideoMedia(brief.media, userId, files, signal, runId)
        : undefined
    if (brief.visualMode === 'hyperframes' && portrait)
      return await renderMotion(brief, signal, media?.speech)
    // shortcut: 3D overlays keep the canvas badge, Blender frames are raster
    if (!portrait && brief.subject === 'none') {
      if (files.length > 1)
        throw new AppError('BAD_REQUEST', {
          key: 'so-video-image',
          message: 'แนบภาพ PNG ได้สูงสุด 1 รูป',
        })
      const product = files[0] && (await productPng(userId, files[0]))
      return await renderMotion(brief, signal, undefined, product || undefined)
    }
    const photos = await productImages(userId, files, portrait ? 4 : 1)
    if (media)
      photos.push(
        ...(await Promise.all(media.images.map((bytes) => loadImage(bytes)))),
      )
    const hero =
      brief.subject === 'none'
        ? []
        : await Promise.all(
            (await blenderFrames(brief, signal)).map((bytes) =>
              loadImage(bytes),
            ),
          )
    const representative = hero[Math.floor(hero.length / 2)]
    const material = representative ? [representative, ...photos] : photos
    const scenes = brief.beats?.length
      ? await directScenes(brief, material, signal)
      : []
    const encoded = await encodeShot(
      brief,
      signal,
      photos,
      hero,
      scenes,
      media?.speech,
    )
    if (encoded.length <= FILE_LIMIT) return encoded
    signal.throwIfAborted()
    return await encodeShot(
      brief,
      signal,
      photos,
      hero,
      scenes,
      media?.speech,
      (0.85 * FILE_LIMIT) / encoded.length,
    )
  })
}
async function encodeShot(
  brief: VideoBrief,
  signal: AbortSignal,
  photos: Image[],
  hero: Image[],
  scenes: FilmScene[],
  speech?: Buffer,
  bitrateScale = 1,
) {
  const {
    AudioSample,
    AudioSampleSource,
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
  const samplesPerFrame = sampleRate / fps
  const voiceFrames = Math.ceil((speech?.length ?? 0) / 2 / samplesPerFrame)
  const timeline = portraitTimeline(
    brief,
    voiceFrames ? Math.min(24 * fps, voiceFrames + 10) : 0,
  )
  const frameCount = overlay ? 3 * fps : (timeline.at(-1)?.end ?? 0)
  const voiceStart = Math.min(6, Math.floor((frameCount - voiceFrames) / 2))
  const audio =
    speech && new AudioSampleSource({ codec: 'opus', bitrate: 64000 })
  const previous =
    !overlay && scenes.some((scene) => scene.transition !== 'cut')
      ? createCanvas(width, height)
      : undefined
  const source = new VideoSampleSource({
    codec: 'vp9',
    bitrate: Math.floor(
      bitrateScale *
        (overlay
          ? 1400000
          : Math.min(3600000, (52_000_000 * fps) / frameCount)),
    ),
    alpha: overlay ? 'keep' : 'discard',
    latencyMode: 'realtime',
    hardwareAcceleration: 'prefer-software',
  })
  if (audio) output.addAudioTrack(audio)
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()
  try {
    let editIndex = 0
    for (let i = 0; i < frameCount; i++) {
      signal.throwIfAborted()
      if (!overlay && i === timeline[editIndex]?.end) {
        editIndex++
        if (scenes[editIndex]?.transition !== 'cut')
          previous?.getContext('2d').drawImage(canvas, 0, 0)
      }
      ctx.clearRect(0, 0, width, height)
      const animated = hero[Math.floor((i / frameCount) * hero.length)]
      if (overlay)
        drawOverlay(ctx, brief, animated ?? photos[0], i, width, height)
      else {
        const edit = timeline[editIndex]
        if (!edit) throw new Error('Missing portrait shot')
        const scene = scenes[editIndex]
        if (scene)
          drawScene(
            ctx,
            scene,
            animated ? [animated, ...photos] : photos,
            (i - edit.start) / (edit.end - edit.start),
            (i - edit.start) / fps,
          )
        else drawPortrait(ctx, brief, animated ?? photos[0], i / fps)
        const blend = (i - edit.start + 1) / 7
        if (
          previous &&
          editIndex > 0 &&
          blend < 1 &&
          scene &&
          scene.transition !== 'cut'
        ) {
          ctx.save()
          if (scene.transition === 'dissolve') ctx.globalAlpha = 1 - blend
          else {
            ctx.beginPath()
            ctx.rect(width * blend, 0, width * (1 - blend), height)
            ctx.clip()
          }
          ctx.drawImage(previous, 0, 0)
          ctx.restore()
        }
      }
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
      if (audio && speech) {
        const bytes = Buffer.alloc(samplesPerFrame * 2)
        const offset = (i - voiceStart) * bytes.length
        if (offset >= 0 && offset < speech.length)
          speech.copy(bytes, 0, offset, offset + bytes.length)
        const chunk = new AudioSample({
          data: bytes,
          format: 's16',
          sampleRate,
          numberOfChannels: 1,
          timestamp: i / fps,
        })
        try {
          await audio.add(chunk)
        } finally {
          chunk.close()
        }
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
