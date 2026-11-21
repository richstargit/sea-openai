import { existsSync, mkdtempSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createCanvas } from '@napi-rs/canvas'
import { hookMachineConfig } from '@/config/hook-machine.config.js'
import {
  chooseFraming,
  containRect,
  coverVisibleShare,
  MAX_CONTAIN_ZOOM,
  MIN_VISIBLE_SHARE,
  sourceRect,
} from '@/services/compose/camera.js'
import { buildCaptionPages, phrasesOf } from '@/services/compose/captions.js'
import { thaiFontFamily } from '@/services/compose/fonts.js'
import { composeClip } from '@/services/compose/index.js'
import {
  ASPECTS,
  type Aspect,
  DEFAULT_ASPECT,
  DEMO_DIVISOR,
  frameSize,
  isAspect,
  PRESETS,
  presetFor,
  safeBox,
  unitScale,
} from '@/services/compose/presets.js'
import {
  captionBox,
  captionLayout,
  makeMeasure,
} from '@/services/compose/render.js'
import { runCli } from '@/services/hook-machine/exec.js'
import { synthTone } from '@/services/hook-machine/voice/wav.js'

const ratio = (label: string) => {
  const [a, b] = label.split(':').map(Number) as [number, number]
  return [a, b] as const
}

describe('preset table', () => {
  it('has exactly the four shapes and 9:16 is the default', () => {
    expect([...ASPECTS]).toEqual(['9:16', '4:5', '1:1', '16:9'])
    expect(DEFAULT_ASPECT).toBe('9:16')
    expect(presetFor()).toBe(PRESETS['9:16'])
    expect(isAspect('4:5')).toBe(true)
    for (const bad of ['4:3', '', null, 1, undefined, '9:16 ']) {
      expect(isAspect(bad)).toBe(false)
    }
  })

  it('uses the sizes each platform asks for', () => {
    const sizes = Object.fromEntries(
      ASPECTS.map((a) => [a, [PRESETS[a].width, PRESETS[a].height]]),
    )
    expect(sizes).toEqual({
      '9:16': [1080, 1920],
      '4:5': [1080, 1350],
      '1:1': [1080, 1080],
      '16:9': [1920, 1080],
    })
  })

  it('has even sides and a ratio that matches its label', () => {
    for (const aspect of ASPECTS) {
      const { width, height } = PRESETS[aspect]
      expect(width % 2).toBe(0)
      expect(height % 2).toBe(0)
      const [a, b] = ratio(aspect)
      // Exact: width / height === a / b without any rounding.
      expect(width * b).toBe(height * a)
      expect(PRESETS[aspect].aspect).toBe(aspect)
    }
  })

  it('keeps the caption margins as recommended, and inside the frame', () => {
    const recommended: Record<Aspect, number[]> = {
      '9:16': [14, 25, 6, 6],
      '4:5': [5, 8, 5, 5],
      '1:1': [6, 6, 6, 6],
      '16:9': [8, 10, 5, 5],
    }
    for (const aspect of ASPECTS) {
      const { safe, width, height } = PRESETS[aspect]
      expect([safe.top, safe.bottom, safe.left, safe.right]).toEqual(
        recommended[aspect],
      )
      for (const side of Object.values(safe)) {
        expect(side).toBeGreaterThan(0)
        expect(side).toBeLessThan(50)
      }
      expect(safe.left + safe.right).toBeLessThan(100)
      expect(safe.top + safe.bottom).toBeLessThan(100)

      const box = safeBox(safe, width, height)
      expect(box.left).toBeGreaterThan(0)
      expect(width - box.right).toBeGreaterThan(box.left)
      expect(box.top).toBeGreaterThan(0)
      expect(box.captionBottom).toBeLessThan(height)
      expect(box.captionBottom).toBeGreaterThan(box.top)
    }
  })

  it('renders a third of the size in demo mode, still even and in ratio', () => {
    expect(DEMO_DIVISOR).toBe(3)
    expect(frameSize('9:16', true)).toEqual({ width: 360, height: 640 })
    expect(frameSize('4:5', true)).toEqual({ width: 360, height: 450 })
    expect(frameSize('1:1', true)).toEqual({ width: 360, height: 360 })
    expect(frameSize('16:9', true)).toEqual({ width: 640, height: 360 })
    for (const aspect of ASPECTS) {
      const { width, height } = frameSize(aspect, true)
      const [a, b] = ratio(aspect)
      expect(width % 2).toBe(0)
      expect(height % 2).toBe(0)
      expect(width * b).toBe(height * a)
      expect(frameSize(aspect)).toEqual({
        width: PRESETS[aspect].width,
        height: PRESETS[aspect].height,
      })
    }
  })

  it('scales pixel sizes from the frame, with 720 wide 9:16 as the reference', () => {
    expect(unitScale(720, 1280)).toBe(1)
    expect(unitScale(1080, 1920)).toBe(1.5)
    expect(unitScale(1920, 1080)).toBe(1.5)
    expect(unitScale(360, 640)).toBe(0.5)
  })
})

describe('caption layout per shape', () => {
  const text = [
    'ตอนนี้เราสามารถเล่นเกมพีเอสห้าบนพีซีได้แล้วโดยที่ไม่ต้องซื้อพีเอสห้าแม้แต่เครื่องเดียว',
    'เซรั่มขวดแก้วสีอำพันฝาทองหนึ่งขวดสามสิบมิลลิลิตร ใช้แล้วผิวดูชุ่มชื้นขึ้น Daily Glow',
    'สั้นๆ',
    'ทดลองใช้เลยวันนี้ที่หน้าร้านของเราและติดตามรีวิวจริงจากผู้ใช้งานได้ที่ลิงก์ด้านล่าง',
  ]

  it('keeps the old 9:16 caption look at the reference size', () => {
    const layout = captionLayout(720, 1280)
    expect(layout.fontPx).toBe(Math.round(720 * 0.058))
    expect(layout.linePx).toBe(Math.round(layout.fontPx * 1.42))
    // The caption box still sits on the same line: three quarters of the height.
    const edge = safeBox(PRESETS['9:16'].safe, 720, 1280)
    expect(edge.captionBottom).toBe(960)
  })

  for (const demo of [false, true]) {
    for (const aspect of ASPECTS) {
      it(`wraps Thai inside the room of ${aspect} (${demo ? 'demo' : 'full'} size)`, () => {
        const preset = PRESETS[aspect]
        const { width, height } = frameSize(aspect, demo)
        const edge = safeBox(preset.safe, width, height)
        const layout = captionLayout(width, height, undefined, preset)
        const family = thaiFontFamily()
        const measure = makeMeasure(family, layout.fontPx)

        // The font grows and shrinks with the frame.
        expect(layout.fontPx).toBeGreaterThanOrEqual(
          Math.round(Math.min(width, height) * 0.058 * preset.captionScale) - 1,
        )
        // The line width is what the safe area leaves, and a cap for wide frames.
        expect(layout.maxTextWidth).toBeGreaterThan(width * 0.3)
        expect(layout.maxTextWidth).toBeLessThanOrEqual(
          width - edge.left - edge.right,
        )
        if (preset.captionMaxWidthPct !== null) {
          expect(layout.maxTextWidth).toBeLessThanOrEqual(
            (width * preset.captionMaxWidthPct) / 100,
          )
        }

        const timeline = text.map((t, i) => ({
          index: i,
          startSec: i * 4,
          endSec: i * 4 + 4,
          text: t,
          imageIndex: 0,
        }))
        const pages = buildCaptionPages(timeline, measure, layout.maxTextWidth)
        expect(pages.length).toBe(text.length)
        for (const beatPages of pages) {
          for (const page of beatPages) {
            // At most two lines, and no line is wider than the room.
            expect(page.lines.length).toBeGreaterThanOrEqual(1)
            expect(page.lines.length).toBeLessThanOrEqual(2)
            const widths = page.lines.map((l) => measure(l))
            for (const w of widths) {
              expect(w).toBeLessThanOrEqual(layout.maxTextWidth + 1)
            }
            // The whole caption box stays inside the safe area at every moment of its fade in.
            for (const lead of [0, 0.5, 1]) {
              const box = captionBox(
                width,
                height,
                preset.safe,
                layout,
                widths,
                lead,
              )
              expect(box.x).toBeGreaterThanOrEqual(edge.left - 0.5)
              expect(box.x + box.w).toBeLessThanOrEqual(
                width - edge.right + 0.5,
              )
              expect(box.y).toBeGreaterThan(edge.top)
              // It eases in from slightly lower, never lower than a few pixels past the line.
              const k = unitScale(width, height)
              expect(box.y + box.h).toBeLessThanOrEqual(
                edge.captionBottom + 14 * k + 0.5,
              )
              if (lead === 1) {
                expect(box.y + box.h).toBeCloseTo(edge.captionBottom, 5)
              }
            }
          }
        }
        // Phrases that never get cut still need to fit a line at the chosen size.
        expect(phrasesOf(text).length).toBeGreaterThan(3)
      })
    }
  }

  it('keeps landscape captions narrower than the frame, and others as wide as the safe area', () => {
    const wide = captionLayout(1920, 1080, undefined, PRESETS['16:9'])
    const phone = captionLayout(1080, 1920, undefined, PRESETS['9:16'])
    expect(wide.maxTextWidth).toBeLessThan(1920 * 0.58)
    expect(phone.maxTextWidth).toBeGreaterThan(1080 * 0.7)
  })
})

describe('photo framing per shape', () => {
  const photos: Record<string, { width: number; height: number }> = {
    portrait916: { width: 506, height: 900 },
    portrait45: { width: 720, height: 900 },
    square: { width: 900, height: 900 },
    landscape32: { width: 900, height: 600 },
    landscape169: { width: 900, height: 506 },
  }

  it('measures how much of the photo a cover crop keeps', () => {
    const view = { width: 1920, height: 1080 }
    expect(coverVisibleShare(photos.landscape169 as never, view)).toBeCloseTo(
      1,
      1,
    )
    // A portrait 9:16 photo keeps about a third in a 16:9 frame.
    expect(coverVisibleShare(photos.portrait916 as never, view)).toBeCloseTo(
      0.316,
      2,
    )
  })

  it('keeps the old 9:16 crop whatever the photo is', () => {
    for (const photo of Object.values(photos)) {
      expect(
        chooseFraming(PRESETS['9:16'].fit, photo, {
          width: 1080,
          height: 1920,
        }),
      ).toBe('cover')
    }
  })

  it('crops lightly and shows the whole photo when a crop would lose too much', () => {
    const view = (a: Aspect) => ({
      width: PRESETS[a].width,
      height: PRESETS[a].height,
    })
    const framingOf = (a: Aspect, photo: keyof typeof photos) =>
      chooseFraming(PRESETS[a].fit, photos[photo] as never, view(a))
    // Portrait photo, 4:5 feed: a small crop is fine.
    expect(framingOf('4:5', 'portrait916')).toBe('cover')
    expect(framingOf('4:5', 'portrait45')).toBe('cover')
    // Tall photo in a square or a wide frame would lose most of its height.
    expect(framingOf('1:1', 'portrait916')).toBe('contain')
    expect(framingOf('16:9', 'portrait916')).toBe('contain')
    expect(framingOf('16:9', 'square')).toBe('contain')
    expect(framingOf('16:9', 'portrait45')).toBe('contain')
    // A photo shaped like the frame fills it.
    expect(framingOf('16:9', 'landscape169')).toBe('cover')
    expect(framingOf('1:1', 'square')).toBe('cover')
    // A wide photo in the feed shape is shown whole.
    expect(framingOf('4:5', 'landscape169')).toBe('contain')
    expect(MIN_VISIBLE_SHARE).toBe(0.6)
  })

  it('keeps the subject in frame, never stretches and enlarges only a little', () => {
    const zooms = [1, 1.2, 1.5, 2, 3]
    const spots = [0.1, 0.3, 0.5, 0.7, 0.9]
    for (const aspect of ASPECTS) {
      const view = {
        width: PRESETS[aspect].width,
        height: PRESETS[aspect].height,
      }
      const anchor = { x: 0.5, y: PRESETS[aspect].subjectY }
      for (const photo of Object.values(photos)) {
        const fitScale = Math.min(
          view.width / photo.width,
          view.height / photo.height,
        )
        for (const zoom of zooms) {
          for (const x of spots) {
            for (const y of spots) {
              const r = containRect({ x, y, zoom }, photo, view, anchor)
              // One scale on both axes.
              expect(r.dw / photo.width).toBeCloseTo(r.dh / photo.height, 6)
              // Enlarged by at most a fifth beyond "fits entirely".
              expect(r.scale).toBeGreaterThanOrEqual(fitScale - 1e-9)
              expect(r.scale).toBeLessThanOrEqual(
                fitScale * MAX_CONTAIN_ZOOM + 1e-9,
              )
              // No gap along an axis the photo is larger than.
              if (r.dw >= view.width) {
                expect(r.dx).toBeLessThanOrEqual(1e-6)
                expect(r.dx + r.dw).toBeGreaterThanOrEqual(view.width - 1e-6)
              } else {
                expect(r.dx).toBeCloseTo((view.width - r.dw) / 2, 6)
              }
              if (r.dh >= view.height) {
                expect(r.dy).toBeLessThanOrEqual(1e-6)
                expect(r.dy + r.dh).toBeGreaterThanOrEqual(view.height - 1e-6)
              } else {
                expect(r.dy).toBeCloseTo((view.height - r.dh) / 2, 6)
              }
              // The point of the photo the camera looks at is on screen.
              if (x >= 0.3 && x <= 0.7 && y >= 0.3 && y <= 0.7) {
                const px = r.dx + x * r.dw
                const py = r.dy + y * r.dh
                expect(px).toBeGreaterThanOrEqual(0)
                expect(px).toBeLessThanOrEqual(view.width)
                expect(py).toBeGreaterThanOrEqual(0)
                expect(py).toBeLessThanOrEqual(view.height)
              }
            }
          }
        }
        // At zoom one the whole photo is visible.
        const whole = containRect({ x: 0.5, y: 0.5, zoom: 1 }, photo, view)
        expect(whole.dx).toBeGreaterThanOrEqual(-1e-6)
        expect(whole.dy).toBeGreaterThanOrEqual(-1e-6)
        expect(whole.dx + whole.dw).toBeLessThanOrEqual(view.width + 1e-6)
        expect(whole.dy + whole.dh).toBeLessThanOrEqual(view.height + 1e-6)
      }
    }
  })

  it('enlarges a tall photo far less in a wide frame than a cover crop would', () => {
    const view = { width: 1920, height: 1080 }
    const photo = photos.portrait916 as never as {
      width: number
      height: number
    }
    const cover = Math.max(view.width / photo.width, view.height / photo.height)
    const contain = containRect(
      { x: 0.5, y: 0.5, zoom: 1.5 },
      photo,
      view,
    ).scale
    expect(contain).toBeLessThan(cover / 2.5)
    // The cover crop is still available and still unchanged for callers that want it.
    const rect = sourceRect({ x: 0.5, y: 0.5, zoom: 1 }, photo, view)
    expect(rect.sw / rect.sh).toBeCloseTo(view.width / view.height, 6)
  })
})

describe('rendering every shape in demo mode', () => {
  let probe: ((file: string) => Promise<string>) | null = null

  beforeAll(async () => {
    try {
      await runCli(hookMachineConfig.ffprobeBin, ['-version'], {
        timeoutMs: 15_000,
      })
      probe = async (file) =>
        (
          await runCli(
            hookMachineConfig.ffprobeBin,
            [
              '-v',
              'error',
              '-show_entries',
              'stream=codec_name,codec_type,profile,width,height,pix_fmt,sample_rate,r_frame_rate',
              '-of',
              'compact=p=0',
              file,
            ],
            { timeoutMs: 30_000 },
          )
        ).stdout
    } catch {
      probe = null
    }
    // Where ffprobe is installed, the size checks below must really run.
    if (
      [
        '/opt/homebrew/bin/ffprobe',
        '/usr/local/bin/ffprobe',
        '/usr/bin/ffprobe',
      ].some(existsSync)
    ) {
      expect(probe).not.toBeNull()
    }
  })

  function productPhoto(width: number, height: number): Buffer {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createLinearGradient(0, 0, 0, height)
    gradient.addColorStop(0, '#f2d9a8')
    gradient.addColorStop(1, '#a8741f')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#5a3a0a'
    ctx.fillRect(width * 0.34, height * 0.25, width * 0.32, height * 0.5)
    return canvas.toBuffer('image/png')
  }

  for (const aspect of ASPECTS) {
    it(`renders ${aspect} at the demo size with the voice attached`, async () => {
      const dir = mkdtempSync(
        path.join(os.tmpdir(), `shape-${aspect.replace(':', 'x')}-`),
      )
      const audioPath = path.join(dir, 'voice.wav')
      await writeFile(audioPath, synthTone(2.4))
      const { width, height } = frameSize(aspect, true)
      const result = await composeClip({
        beats: [
          { voiceover: 'ตอนนี้เราสามารถเล่นเกมบนพีซีได้แล้ว', imageIndex: 0 },
          { voiceover: 'ไม่ต้องซื้อเครื่องเพิ่มเลย', imageIndex: 0 },
        ],
        images: [productPhoto(400, 700)],
        audioPath,
        outPath: path.join(dir, 'out.mp4'),
        title: 'Daily Glow Serum 30 มล',
        aspect,
        width,
        height,
        fps: 12,
      })
      expect(result.aspect).toBe(aspect)
      expect(result.width).toBe(width)
      expect(result.height).toBe(height)
      expect(result.captionFontPx).toBeGreaterThan(8)

      if (!probe) return
      const info = await probe(result.path)
      expect(info).toContain(`width=${width}`)
      expect(info).toContain(`height=${height}`)
      expect(info).toMatch(/codec_name=h264/)
      expect(info).toMatch(/profile=High/)
      expect(info).toMatch(/pix_fmt=yuv420p/)
      expect(info).toMatch(/codec_name=aac/)
      expect(info).toMatch(/sample_rate=48000/)
    }, 60_000)
  }

  it('turns a shape into the default size when only the shape is given', async () => {
    const preset = presetFor('1:1')
    expect(frameSize(preset.aspect)).toEqual({ width: 1080, height: 1080 })
  })

  it('refuses odd sides and a size with only one side', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'shape-bad-'))
    const audioPath = path.join(dir, 'voice.wav')
    await writeFile(audioPath, synthTone(1))
    const base = {
      beats: [{ voiceover: 'ทดสอบ', imageIndex: 0 }],
      images: [productPhoto(100, 100)],
      audioPath,
      outPath: path.join(dir, 'out.mp4'),
    }
    await expect(
      composeClip({ ...base, width: 361, height: 640 }),
    ).rejects.toThrow(/even/)
    await expect(composeClip({ ...base, width: 360 })).rejects.toThrow(
      /both width and height/,
    )
  })
})
