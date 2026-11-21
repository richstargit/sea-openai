import { execFile } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { load } from 'cheerio'
import { z } from 'zod'
import { FILE_LIMIT } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'
import { colors, type VideoBrief } from '@/services/video/brief.js'
import { select } from '@/services/video/direction.js'
import { runVideoSandbox } from '@/services/video/sandbox.js'

const exec = promisify(execFile)
const projectRequire = createRequire(resolve('package.json'))
const cli = resolve('node_modules/hyperframes/bin/hyperframes.mjs')
const key = z.string().regex(/^[a-z][a-z0-9-]{0,40}$/)
const drawing = z.strictObject({
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  svg: z.string().min(1).max(9000),
  moves: z
    .array(
      z.strictObject({
        target: key,
        property: z.enum([
          'x',
          'y',
          'scale',
          'scaleX',
          'scaleY',
          'rotation',
          'opacity',
          'strokeDashoffset',
        ]),
        from: z.number().min(-5000).max(5000),
        to: z.number().min(-5000).max(5000),
        at: z.number().min(0).max(0.95),
        span: z.number().min(0.02).max(1),
        ease: z.enum([
          'none',
          'sine.inOut',
          'power3.out',
          'power3.inOut',
          'expo.out',
          'back.out(1.2)',
        ]),
      }),
    )
    .min(1)
    .max(22),
})
type Drawing = z.infer<typeof drawing>
// overlay renders on transparent alpha, so the model draws its own backing shapes
const overlayDrawing = drawing.omit({ background: true })
type Scene = Omit<Drawing, 'background'> & { background?: string }
type Frame = { width: number; height: number; product: boolean }
const elementNames = new Set(
  'g defs linearGradient radialGradient stop clipPath mask path circle ellipse line polygon polyline rect text tspan'.split(
    ' ',
  ),
)
const attrNames = new Set(
  'id d points transform x y x1 x2 y1 y2 cx cy fx fy r rx ry width height offset gradientUnits gradientTransform fill fill-rule fill-opacity stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity opacity stop-color stop-opacity font-family font-size font-weight letter-spacing text-anchor dominant-baseline clip-path mask textLength lengthAdjust'.split(
    ' ',
  ),
)
const xmlText = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')

export function motionArtwork(svg: string, prefix: string) {
  const $ = load(`<svg>${svg}</svg>`, { xmlMode: true })
  const ids = new Set<string>()
  const contents = $('svg').first().contents()
  function node(el: (typeof contents)[number]): string {
    if (el.type === 'text') return xmlText(el.data)
    if (el.type !== 'tag' || !elementNames.has(el.name)) return ''
    const attrs: string[] = []
    for (const [name, raw] of Object.entries(el.attribs)) {
      if (!attrNames.has(name)) continue
      let value = raw
      if (name === 'id') {
        if (!key.safeParse(raw).success || ids.has(raw)) continue
        ids.add(raw)
        value = prefix + raw
      } else if (
        ['fill', 'stroke', 'stop-color', 'clip-path', 'mask'].includes(name)
      ) {
        const ref = /^url\(#([a-z][a-z0-9-]*)\)$/.exec(raw)
        if (ref) value = `url(#${prefix}${ref[1]})`
        else if (
          !/^(none|transparent|currentColor|black|white|#[a-f\d]{3,8})$/i.test(
            raw,
          )
        )
          continue
      }
      attrs.push(`${name}="${xmlText(value)}"`)
    }
    return `<${el.name} ${attrs.join(' ')}>${el.children.map(node).join('')}</${el.name}>`
  }
  const root = $('svg').first()
  const children = root.children('svg').length
    ? root.children('svg').first().contents()
    : root.contents()
  return { markup: children.toArray().map(node).join(''), ids }
}

function compose(
  scenes: Scene[],
  durations: number[],
  audio: boolean,
  audioStart: number,
  audioLength: number,
  { width, height, product }: Frame,
) {
  let start = 0
  const blocks: string[] = []
  const tweens: string[] = []
  scenes.forEach((scene, i) => {
    const seconds = durations[i] ?? 2
    const prefix = `s${i}-`
    const { markup, ids } = motionArtwork(scene.svg, prefix)
    if (!markup || !scene.moves.some((move) => ids.has(move.target)))
      throw new Error('Motion scene has no drawable animation target')
    blocks.push(
      `<section id="shot-${i}" class="clip" data-start="${start}" data-duration="${seconds}" data-track-index="${i}" data-track-kind="graphics"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${scene.background ? `<rect width="${width}" height="${height}" fill="${scene.background}"/>` : ''}${markup}</svg></section>`,
    )
    for (const move of scene.moves) {
      if (!ids.has(move.target)) continue
      const duration = Math.min(move.span, 1 - move.at) * seconds
      const from = { [move.property]: move.from, transformOrigin: '50% 50%' }
      const to = {
        [move.property]: move.to,
        duration,
        ease: move.ease,
        immediateRender: false,
      }
      tweens.push(
        `tl.fromTo("#${prefix}${move.target}",${JSON.stringify(from)},${JSON.stringify(to)},${start + seconds * move.at});`,
      )
    }
    start += seconds
  })
  if (product) {
    blocks.push(
      `<img id="product" class="clip" data-start="0" data-duration="${start}" data-track-index="${scenes.length + 1}" src="assets/product.png" alt="">`,
    )
    tweens.push(
      `tl.fromTo("#product",{opacity:0,scale:0.8},{opacity:1,scale:1,duration:0.4,ease:"back.out(1.2)",immediateRender:false},0.2);tl.to("#product",{opacity:0,duration:0.3},${Math.max(0.6, start - 0.4)});`,
    )
  }
  const soundtrack = audio
    ? `<audio id="voice" class="clip" data-start="${audioStart}" data-duration="${audioLength}" data-track-index="${scenes.length}" src="assets/voice.wav"></audio>`
    : ''
  return `<!doctype html><html><head><meta charset="UTF-8"><script src="assets/gsap.min.js"></script><style>*{box-sizing:border-box}html,body,#film{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${scenes[0]?.background ?? 'transparent'}}section{position:absolute;inset:0}svg{display:block}#product{position:absolute;right:16px;top:16px;width:184px;height:184px;object-fit:contain}</style></head><body><main id="film" data-composition-id="film" data-start="0" data-duration="${start}" data-width="${width}" data-height="${height}" data-fps="24">${blocks.join('')}${soundtrack}</main><script>const tl=gsap.timeline({paused:true});${tweens.join('\n')}window.__timelines=window.__timelines||{};window.__timelines.film=tl;</script></body></html>`
}

async function run(
  dir: string,
  command: string,
  args: string[],
  signal: AbortSignal,
) {
  const { HOME, PATH, TMPDIR, LANG } = process.env
  return exec(process.execPath, [cli, command, dir, ...args], {
    cwd: dir,
    signal,
    timeout: 180_000,
    maxBuffer: 3 * 1024 * 1024,
    env: { HOME, PATH, TMPDIR, LANG, HYPERFRAMES_TELEMETRY_DISABLED: '1' },
  })
}

function wave(pcm: Buffer) {
  const header = Buffer.alloc(44)
  header.write('RIFF')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(24000, 24)
  header.writeUInt32LE(48000, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

const overlayDirection = (portraitRules: string[]) =>
  [
    'Act as a motion designer authoring one original HyperFrames/GSAP lower-third graphic for a live stream. It plays over live video for 3 seconds on a transparent 768 by 216 canvas, so draw your own backing shapes and keep everything else empty. No raster images, photos, stock icons or filler labels.',
    portraitRules[2],
    'Show the title and subtitle verbatim and readable, title larger. Use the accent hex as the highlight colour with a dark, high-contrast backing. Match the requested motion style (slide, pulse or wipe). Animate in within the first 0.5 seconds, hold readable copy, then animate everything out by the end of the shot. When product is true keep the right 200 pixels empty for the product photo. Use Helvetica Neue with a suitable Thai fallback. Max 3200 SVG characters and 9 moves.',
  ].join(' ')

export async function renderMotion(
  brief: VideoBrief,
  signal: AbortSignal,
  speech?: Buffer,
  product?: Buffer,
) {
  const overlay = brief.format === 'overlay'
  const frame: Frame = overlay
    ? { width: 768, height: 216, product: !!product }
    : { width: 720, height: 1280, product: false }
  const beats = brief.beats ?? []
  const dir = await mkdtemp(join(tmpdir(), 'sea-hyperframes-'))
  try {
    await mkdir(join(dir, 'assets'))
    await copyFile(
      projectRequire.resolve('gsap/dist/gsap.min.js'),
      join(dir, 'assets/gsap.min.js'),
    )
    if (speech) await writeFile(join(dir, 'assets/voice.wav'), wave(speech))
    if (product) await writeFile(join(dir, 'assets/product.png'), product)
    const durations = overlay
      ? [3]
      : beats.map((beat) => Math.round(beat.seconds * 24) / 24)
    const voiceLength = (speech?.length ?? 0) / 48000
    const duration = durations.reduce((sum, value) => sum + value, 0)
    if (voiceLength > duration && durations.length)
      durations[durations.length - 1] =
        (durations.at(-1) ?? 0) + Math.ceil((voiceLength - duration) * 24) / 24
    const startBeat = Math.max(
      0,
      beats.findIndex((beat) => beat.say.trim()),
    )
    const voiceStart = Math.min(
      Math.max(0, duration - voiceLength),
      durations.slice(0, startBeat).reduce((sum, value) => sum + value, 0),
    )
    const direction = [
      'Act as a motion designer authoring one original HyperFrames/GSAP scene of a single art-directed film. Read the whole storyboard. Make this beat work as a moving image, not a static title slide. Continue the motif and match the silhouettes with adjacent beats. No raster images, photos, footage, stock icons, generic interface or filler labels.',
      'Create original inline SVG fragments on a 720 by 1280 portrait canvas. Use grouped original paths, rich silhouettes, cutouts and restrained gradients. Make a strong visual subject with depth built from multiple overlapping layers. Use a limited consistent ink/paper/accent world. Work with the exact hex codes and type directions in look. Compose full bleed with confident scale; let the focal graphic occupy the frame. Use negative space on purpose.',
      'The SVG fragment can contain g, path, circle, ellipse, line, rect, polygon, polyline, defs, linearGradient, radialGradient, stop, clipPath, mask, text, tspan. Use ordinary SVG presentation attributes, local url(#id) references, no CSS style, scripts, filters, external media or use elements. Assign short unique lowercase ids to the animated groups. Reference only these ids in moves. Leave any fixed transforms on nested groups.',
      'Design purposeful choreography with independent overlapping moves, anticipation, reveal, counter-motion, overshoot and a readable hold. at and span are fractions of this shot duration; motion translations are pixels. Keep the first and last frame intentional; no mandatory fade in/out. Do not cut off readable text. Set a large deliberate font-size, using Georgia or Helvetica Neue and a suitable Thai fallback. Preserve copy requested in the brief and avoid arbitrary added words. Max 3200 SVG characters and 9 moves normally.',
    ]
    const context = overlay
      ? {
          title: brief.title,
          subtitle: brief.subtitle,
          accent: colors[brief.color],
          motion: brief.motion,
          product: !!product,
        }
      : {
          title: brief.title,
          subtitle: brief.subtitle,
          look: brief.look,
          beats,
        }
    const sceneSchema = overlay ? overlayDrawing : drawing
    const sceneDirection = overlay
      ? overlayDirection(direction)
      : direction.join(' ')
    const scenes: Scene[] = []
    if (overlay)
      scenes.push(
        await select(
          'design_motion_scene',
          sceneSchema,
          sceneDirection,
          JSON.stringify({ ...context, sceneIndex: 0 }),
          signal,
          4900,
        ),
      )
    for (let first = 0; !overlay && first < beats.length; first += 3) {
      scenes.push(
        ...(await Promise.all(
          beats
            .slice(first, first + 3)
            .map((_, i) =>
              select(
                'design_motion_scene',
                sceneSchema,
                sceneDirection,
                JSON.stringify({ ...context, sceneIndex: first + i }),
                signal,
                4900,
              ),
            ),
        )),
      )
    }
    const write = () =>
      writeFile(
        join(dir, 'index.html'),
        compose(scenes, durations, !!speech, voiceStart, voiceLength, frame),
      )
    await write()
    let cursor = 0
    const mids = durations.map((seconds) => {
      const mid = cursor + seconds * 0.6
      cursor += seconds
      return mid.toFixed(3)
    })
    await runVideoSandbox(
      dir,
      [
        'hyperframes',
        'snapshot',
        '.',
        '--at',
        mids.join(','),
        '--no-end',
        '--output',
        'proof',
      ],
      signal,
    )
    const stills = (await readdir(join(dir, 'proof')))
      .filter((name) => name.endsWith('.png'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (stills.length !== scenes.length)
      throw new Error('Missing HyperFrames review frames')
    const cellWidth = overlay ? 384 : 180
    const cellHeight = Math.round((cellWidth * frame.height) / frame.width)
    const sheet = createCanvas(
      Math.min(4, stills.length) * cellWidth,
      Math.ceil(stills.length / 4) * cellHeight,
    )
    for (const [i, name] of stills.entries())
      sheet
        .getContext('2d')
        .drawImage(
          await loadImage(await readFile(join(dir, 'proof', name))),
          (i % 4) * cellWidth,
          Math.floor(i / 4) * cellHeight,
          cellWidth,
          cellHeight,
        )
    const review = await select(
      'review_motion_frames',
      z.strictObject({
        fixes: z
          .array(
            z.strictObject({
              index: z
                .int()
                .min(0)
                .max(scenes.length - 1),
              note: z.string().min(1).max(280),
            }),
          )
          .max(3),
      }),
      'Inspect the actual rendered frames in reading order. Flag only concrete visual defects like an empty shot, unreadable or clipped text, a competing focal point or broken shape. Return an empty list when the film reads well.',
      [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: JSON.stringify(context) },
            {
              type: 'input_image',
              detail: 'high',
              image_url: sheet.toDataURL('image/jpeg', 0.9),
            },
          ],
        },
      ],
      signal,
      1200,
    )
    await Promise.all(
      review.fixes.map(async (fix) => {
        scenes[fix.index] = await select(
          'refine_motion_scene',
          sceneSchema,
          sceneDirection,
          JSON.stringify({
            ...context,
            sceneIndex: fix.index,
            original: scenes[fix.index],
            fix: fix.note,
          }),
          signal,
          4900,
        )
      }),
    )
    if (review.fixes.length) await write()
    await run(
      dir,
      'render',
      [
        '--output',
        join(dir, 'video.webm'),
        '--format',
        'webm',
        '--fps',
        '24',
        '--workers',
        '2',
        '--quality',
        'looks',
      ],
      signal,
    )
    const bytes = await readFile(join(dir, 'video.webm'))
    if (bytes.length <= FILE_LIMIT) return bytes
    await exec(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        join(dir, 'video.webm'),
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        String(Math.floor(48_000_000 / cursor)),
        '-c:a',
        'copy',
        join(dir, 'compressed.webm'),
      ],
      { signal, timeout: 120_000 },
    )
    return await readFile(join(dir, 'compressed.webm'))
  } catch (cause) {
    signal.throwIfAborted()
    if (cause instanceof AppError) throw cause
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: 'so-hyperframes-render',
      message: 'เรนเดอร์โมชั่น HyperFrames ไม่สำเร็จ',
      cause,
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
