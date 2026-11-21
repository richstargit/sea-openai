import type { z } from 'zod'
import type { editorComposition } from '@/schemas/editor.schema.js'
import { AppError } from '@/services/error.service.js'

type Scene = z.infer<typeof editorComposition>
type Clip = Scene['project']['clips'][number]
const clipFrames = (clip: Clip) =>
  Math.max(1, Math.round((clip.sourceOut - clip.sourceIn) / clip.speed))
function playsThrough(left: Clip, right: Clip) {
  return (
    left.assetId === right.assetId &&
    left.sourceOut === right.sourceIn &&
    left.sourceIn + clipFrames(left) * left.speed === right.sourceIn &&
    (left.camera ?? 'static') === 'static' &&
    (right.camera ?? 'static') === 'static' &&
    left.speed === right.speed &&
    left.volume === right.volume &&
    left.fit === right.fit &&
    left.brightness === right.brightness &&
    left.contrast === right.contrast &&
    left.saturation === right.saturation
  )
}
const cameraFrames = {
  'push-in': [{ scale: 1 }, { scale: 1.16 }],
  'pull-out': [{ scale: 1.16 }, { scale: 1 }],
  'pan-left': [
    { scale: 1.12, xPercent: 5 },
    { scale: 1.12, xPercent: -5 },
  ],
  'pan-right': [
    { scale: 1.12, xPercent: -5 },
    { scale: 1.12, xPercent: 5 },
  ],
}
const html = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
const seconds = (frames: number) => Number((frames / 30).toFixed(6))
const missing = () =>
  new AppError('BAD_REQUEST', { key: 'so-editor-missing-media' })

export function composeEditor(
  { project, assets }: Scene,
  source: (id: string) => string,
  preview = false,
  silentAssets = new Set<string>(),
) {
  const { width, height } = project.size
  if (width > 7680 || height > 7680 || !project.clips.length)
    throw new AppError('BAD_REQUEST', { key: 'so-editor-frame' })
  const media = new Map(assets.map((asset) => [asset.id, asset]))
  const elements: string[] = []
  const moves: string[] = []
  let end = 0
  let nextVisual = 0
  for (const [index, clip] of project.clips.entries()) {
    const asset = media.get(clip.assetId)
    if (!asset || asset.kind === 'audio') throw missing()
    const frames = clipFrames(clip)
    const start = seconds(end),
      duration = seconds(frames)
    end += frames
    if (end > 30 * 60 * 30)
      throw new AppError('BAD_REQUEST', { key: 'so-editor-film-duration' })
    const timing = `data-start="${start}" data-duration="${duration}"`
    const id = clip.id
    if (index === nextVisual) {
      nextVisual = index + 1
      let visualFrames = frames
      let previous = clip
      while (asset.kind === 'video') {
        const next = project.clips[nextVisual]
        if (!next || !playsThrough(previous, next)) break
        visualFrames += clipFrames(next)
        previous = next
        nextVisual++
      }
      const grade = `object-fit:${clip.fit};filter:brightness(${clip.brightness}) contrast(${clip.contrast}) saturate(${clip.saturation})`
      const shape = `id="visual-${id}" data-start="${start}" data-duration="${seconds(visualFrames)}" data-track-index="0" style="${grade}" src="${html(source(asset.id))}"`
      if (asset.kind === 'image')
        elements.push(`<img class="clip visual" ${shape} alt="">`)
      else
        elements.push(
          `<video class="visual" ${shape} playsinline ${silentAssets.has(asset.id) ? 'muted' : 'data-has-audio="true"'} data-volume="${clip.volume}" data-playback-rate="${clip.speed}" data-media-start="${seconds(clip.sourceIn)}"></video>`,
        )
      if (clip.camera && clip.camera !== 'static') {
        const [from, to] = cameraFrames[clip.camera]
        moves.push(
          `tl.fromTo("#visual-${id}",${JSON.stringify(from)},${JSON.stringify({ ...to, duration, ease: 'sine.inOut', immediateRender: false })},${start});`,
        )
      }
    }
    if (clip.title || clip.subtitle) {
      const color = /^#[\da-f]{3,8}$/i.test(clip.textColor)
        ? clip.textColor
        : '#ffffff'
      const font = Math.max(8, (Math.min(width, height) * clip.textSize) / 100)
      elements.push(
        `<div class="clip caption ${clip.textPosition}" id="caption-${id}" ${timing} data-track-index="1"><div class="band" style="font-size:${font}px;color:${color}"><strong>${html(clip.title)}</strong><small>${html(clip.subtitle)}</small></div></div>`,
      )
    }
    if (clip.transition === 'fade') {
      const ramp = Math.min(8 / 30, duration / 2)
      elements.push(
        `<div class="clip shade" id="fade-${id}" ${timing} data-track-index="2"></div>`,
      )
      moves.push(
        `tl.fromTo("#fade-${id}",{opacity:1},{opacity:0,ease:"none",duration:${ramp},immediateRender:false},${start});tl.to("#fade-${id}",{opacity:1,ease:"none",duration:${ramp}},${start + duration - ramp});`,
      )
    }
  }
  if (project.music) {
    const music = media.get(project.music.assetId)
    if (!music?.frames) throw missing()
    for (let at = 0; at < end; at += music.frames) {
      elements.push(
        `<audio id="music-${at}" src="${html(source(music.id))}" data-start="${seconds(at)}" data-duration="${seconds(Math.min(end - at, music.frames))}" data-track-index="3" data-volume="${project.music.volume}"></audio>`,
      )
    }
  }
  const duration = seconds(end)
  const scripts = preview
    ? '<script src="/agent/hyperframes/gsap.js"></script><script defer src="/agent/hyperframes/runtime.js"></script>'
    : '<script src="assets/gsap.min.js"></script>'
  return `<!doctype html><html><head><meta charset="utf-8">${scripts}<style>*{box-sizing:border-box}html,body,#film{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:#171719}#film{position:relative}.visual,.caption,.shade{position:absolute;inset:0;width:100%;height:100%}.caption{display:flex;flex-direction:column;justify-content:center;text-align:center;pointer-events:none;padding:9% 0;font-family:Arial,sans-serif}.caption.top{justify-content:flex-start}.caption.bottom{justify-content:flex-end}.band{padding:.4em 8%;background:linear-gradient(transparent,#0008 45%,#0004);text-shadow:0 .04em .16em #0009;overflow-wrap:anywhere}.band strong,.band small{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line}.band strong{-webkit-line-clamp:3;line-height:1.24}.band small{font-size:.56em;-webkit-line-clamp:2;line-height:1.3}.band small:not(:empty){margin-top:.3em}.shade{background:#000;pointer-events:none}</style></head><body><div id="film" data-composition-id="main" data-width="${width}" data-height="${height}" data-start="0" data-duration="${duration}">${elements.join('\n')}</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});tl.to({},{duration:${duration}},0);${moves.join('\n')}window.__timelines.main=tl;</script></body></html>`
}
