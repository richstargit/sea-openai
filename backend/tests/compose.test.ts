import {
  cameraAt,
  defaultShots,
  easeInOut,
  sourceRect,
} from '@/services/compose/camera.js'
import {
  breakUnits,
  buildCaptionPages,
  cleanCaption,
  largestFittingFont,
  pageTimings,
  phrasesOf,
  toPages,
  wrapBalanced,
} from '@/services/compose/captions.js'
import { buildEncodeArgs } from '@/services/compose/ffmpeg.js'
import {
  alignBeats,
  expectedBoundaries,
  parseSilenceDetect,
  speechBounds,
} from '@/services/compose/timeline.js'

const beat = (voiceover: string) => ({ voiceover, imageIndex: 0 })

describe('silence parsing', () => {
  it('reads start and end lines and closes a pause that runs to the end', () => {
    const stderr = `
[silencedetect @ 0x1] silence_start: 0
[silencedetect @ 0x1] silence_end: 0.42 | silence_duration: 0.42
[silencedetect @ 0x1] silence_start: 5.1
[silencedetect @ 0x1] silence_end: 5.9 | silence_duration: 0.8
[silencedetect @ 0x1] silence_start: 11.3`
    expect(parseSilenceDetect(stderr, 12)).toEqual([
      { start: 0, end: 0.42 },
      { start: 5.1, end: 5.9 },
      { start: 11.3, end: 12 },
    ])
  })

  it('finds where speech starts and stops', () => {
    expect(
      speechBounds(
        [
          { start: 0, end: 0.4 },
          { start: 11.3, end: 12 },
        ],
        12,
      ),
    ).toEqual({ start: 0.4, end: 11.3 })
    expect(speechBounds([], 12)).toEqual({ start: 0, end: 12 })
  })
})

describe('timeline alignment', () => {
  it('places cuts by character share when nothing else is known', () => {
    const cuts = expectedBoundaries(['aaaa', 'bbbb', 'cccccccc'], 0, 16)
    expect(cuts).toEqual([4, 8])
  })

  it('snaps each cut to the pause nearest where it should fall', () => {
    const beats = [beat('aaaa'), beat('bbbb'), beat('cccccccc')]
    const pauses = [
      { start: 0, end: 0.3 },
      { start: 4.1, end: 4.9 },
      { start: 8.4, end: 9.2 },
      { start: 15.7, end: 16 },
    ]
    const result = alignBeats(beats, pauses, 16)
    expect(result.method).toBe('pauses')
    expect(result.beats.map((b) => [b.startSec, b.endSec])).toEqual([
      [0, 4.5],
      [4.5, 8.8],
      [8.8, 16],
    ])
    expect(result.meanShiftSec).toBeLessThan(1)
  })

  it('ignores the script times and falls back to character share without pauses', () => {
    const beats = [
      { voiceover: 'aaaa', imageIndex: 0, startSec: 0, endSec: 20 },
      { voiceover: 'bbbb', imageIndex: 0, startSec: 20, endSec: 30 },
    ]
    const result = alignBeats(beats, [], 10)
    expect(result.method).toBe('proportional')
    expect(result.beats[0]?.endSec).toBeCloseTo(5, 5)
    expect(result.beats[1]?.endSec).toBe(10)
  })

  it('mixes methods when only some cuts have a pause, and never goes backwards', () => {
    const beats = [beat('aaaa'), beat('bbbb'), beat('cccc')]
    const result = alignBeats(beats, [{ start: 3.9, end: 4.5 }], 12)
    expect(result.method).toBe('mixed')
    const edges = result.beats.flatMap((b) => [b.startSec, b.endSec])
    expect([...edges].sort((a, b) => a - b)).toEqual(edges)
    for (const b of result.beats) expect(b.endSec).toBeGreaterThan(b.startSec)
  })

  it('does not pick a short comma pause over a long gap between lines', () => {
    const beats = [beat('aaaaaaaa'), beat('bbbbbbbb')]
    const pauses = [
      { start: 6.7, end: 6.95 },
      { start: 7.9, end: 8.9 },
    ]
    const result = alignBeats(beats, pauses, 16)
    expect(result.beats[0]?.endSec).toBeCloseTo(8.4, 5)
  })
})

describe('captions', () => {
  it('removes quotes, dashes, middle dots, emoji and sentence full stops', () => {
    expect(cleanCaption('เซรั่มขวดนี้ “ดีมาก”. มาดูกัน.')).toBe('เซรั่มขวดนี้ ดีมาก มาดูกัน')
    expect(cleanCaption('Daily-Glow · 30 ml 😀')).toBe('Daily Glow 30 ml')
    expect(cleanCaption('ราคา 12.50 บาท')).toBe('ราคา 12.50 บาท')
  })

  it('breaks Thai at word boundaries and keeps spaces with the word before', () => {
    const units = breakUnits('ฉลากสีครีม ตัดกับแก้ว')
    expect(units.join('')).toBe('ฉลากสีครีม ตัดกับแก้ว')
    expect(units.length).toBeGreaterThan(3)
    expect(units.every((u) => !/^\s/.test(u))).toBe(true)
  })

  it('never splits inside a word and keeps each line within the width', () => {
    const measure = (s: string) => [...s].length * 10
    const text = 'เซรั่มขวดนี้ ฉลากสีครีมตัดกับแก้วสีอำพันพอดี มาดูรายละเอียดกัน'
    const lines = wrapBalanced(text, measure, 200)
    expect(lines.length).toBeGreaterThan(1)
    for (const l of lines) expect(measure(l)).toBeLessThanOrEqual(200)
    expect(lines.join('').replace(/\s/g, '')).toBe(text.replace(/\s/g, ''))
    // Every cut falls on a word boundary of the full sentence.
    const edges = new Set<number>()
    let run = 0
    for (const unit of breakUnits(text)) {
      run += unit.replace(/\s/g, '').length
      edges.add(run)
    }
    let seen = 0
    for (const l of lines) {
      seen += l.replace(/\s/g, '').length
      expect(edges.has(seen)).toBe(true)
    }
  })

  it('prefers a break at a space over a break inside a phrase', () => {
    const measure = (s: string) => [...s].length * 10
    // Width for 24 characters. A plain word break would put the connector at the end of line one.
    const lines = wrapBalanced('ส่วนที่เป็นฝาสีทอง ส่วนจุกบีบด้านบนเป็นสีดำ', measure, 300)
    expect(lines).toEqual(['ส่วนที่เป็นฝาสีทอง', 'ส่วนจุกบีบด้านบนเป็นสีดำ'])
  })

  it('moves a phrase that fits on a line down whole, even when the line above stays short', () => {
    const measure = (s: string) => [...s].length * 10
    // Width for 20 characters. The second phrase has 17 and cannot share a line with the first (3).
    const lines = wrapBalanced('กขค งจฉชซฌญฎฏฐฑฒณดตถท', measure, 200)
    expect(lines).toEqual(['กขค', 'งจฉชซฌญฎฏฐฑฒณดตถท'])
  })

  it('does not cut a long unbroken phrase in half just to even out the lines', () => {
    const measure = (s: string) => [...s].length * 10
    // 35 characters with no space, then a short phrase. The first break must stay at the space.
    const text = 'กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลว ศษสหฬอ'
    const lines = wrapBalanced(text, measure, 400)
    expect(lines[0]).toBe('กขคงจฉชซฌญฎฏฐฑฒณดตถทธนบปผฝพฟภมยรลว')
  })

  it('balances lines so the last one is not a lone short word', () => {
    const measure = (s: string) => s.length * 10
    const lines = wrapBalanced(
      'aaaa bbbb cccc dddd eeee ffff gggg',
      measure,
      220,
    )
    expect(lines.length).toBe(2)
    const [a, b] = lines
    expect(Math.abs((a?.length ?? 0) - (b?.length ?? 0))).toBeLessThanOrEqual(5)
  })

  it('shows at most two lines per page and merges a tiny tail into the last line', () => {
    expect(toPages(['a', 'b', 'c', 'd', 'e'])).toEqual([
      ['a', 'b'],
      ['c', 'd e'],
    ])
    expect(toPages(['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'])).toEqual([
      ['aaaaaaaaaa', 'bbbbbbbbbb'],
      ['cccccccccc'],
    ])
  })

  it('spreads page times over a beat by how much text each page holds', () => {
    const pages = pageTimings([['aaaa', 'aaaa'], ['bbbb']], 10, 16)
    expect(pages[0]).toMatchObject({ startSec: 10 })
    expect(pages[0]?.endSec).toBeCloseTo(14, 5)
    expect(pages[1]).toMatchObject({ startSec: pages[0]?.endSec, endSec: 16 })
  })

  it('builds pages for every beat that cover the whole beat', () => {
    const timeline = [
      {
        index: 0,
        startSec: 0,
        endSec: 4,
        text: 'สวัสดีครับ วันนี้มีของมาฝาก',
        imageIndex: 0,
      },
      { index: 1, startSec: 4, endSec: 9, text: 'ลองดูกันเลย', imageIndex: 0 },
    ]
    const pages = buildCaptionPages(timeline, (s) => s.length * 20, 300)
    expect(pages).toHaveLength(2)
    for (const [i, beatPages] of pages.entries()) {
      expect(beatPages[0]?.startSec).toBe(timeline[i]?.startSec)
      expect(beatPages[beatPages.length - 1]?.endSec).toBe(timeline[i]?.endSec)
      for (const p of beatPages) expect(p.lines.length).toBeLessThanOrEqual(2)
    }
  })
})

describe('caption font size', () => {
  const measureAt = (px: number) => (s: string) => [...s].length * px * 0.5

  it('picks the largest size at which every phrase fits on a line', () => {
    const phrases = ['ab', 'abcdefghij'] // 10 characters
    expect(largestFittingFont(phrases, measureAt, 300, 62, 40)).toBe(60)
    expect(largestFittingFont(['ab'], measureAt, 300, 62, 40)).toBe(62)
  })

  it('stops at the smallest size when nothing fits', () => {
    expect(largestFittingFont(['x'.repeat(100)], measureAt, 300, 62, 44)).toBe(
      44,
    )
  })

  it('splits text into phrases at spaces after cleaning it', () => {
    expect(phrasesOf(['เซรั่มขวดนี้ ฉลากสีครีม. มาดูกัน', 'อีกประโยค'])).toEqual([
      'เซรั่มขวดนี้',
      'ฉลากสีครีม',
      'มาดูกัน',
      'อีกประโยค',
    ])
  })
})

describe('camera', () => {
  const image = { width: 941, height: 1672 }
  const view = { width: 1080, height: 1920 }

  it('crops with one scale on both axes and stays inside the photo at any zoom', () => {
    for (const zoom of [1, 1.3, 2, 3]) {
      for (const [x, y] of [
        [0, 0],
        [0.5, 0.5],
        [1, 1],
        [0.2, 0.9],
      ] as const) {
        const r = sourceRect({ x, y, zoom }, image, view)
        expect(r.sx).toBeGreaterThanOrEqual(-1e-9)
        expect(r.sy).toBeGreaterThanOrEqual(-1e-9)
        expect(r.sx + r.sw).toBeLessThanOrEqual(image.width + 1e-9)
        expect(r.sy + r.sh).toBeLessThanOrEqual(image.height + 1e-9)
        // Same ratio as the view, so nothing is stretched.
        expect(r.sw / r.sh).toBeCloseTo(view.width / view.height, 6)
      }
    }
  })

  it('moves the subject up the frame when asked, and still stays inside the photo', () => {
    const middle = sourceRect({ x: 0.5, y: 0.5, zoom: 1.6 }, image, view)
    const high = sourceRect({ x: 0.5, y: 0.5, zoom: 1.6 }, image, view, {
      x: 0.5,
      y: 0.4,
    })
    // A crop that starts lower on the photo puts the focus point higher in the frame.
    expect(high.sy).toBeGreaterThan(middle.sy)
    for (const zoom of [1, 1.5, 3]) {
      const r = sourceRect({ x: 0.5, y: 0.95, zoom }, image, view, {
        x: 0.5,
        y: 0.4,
      })
      expect(r.sy + r.sh).toBeLessThanOrEqual(image.height + 1e-9)
      expect(r.sy).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('crops the long side of a wide photo and not the whole photo at zoom one', () => {
    const wide = sourceRect(
      { x: 0.5, y: 0.5, zoom: 1 },
      { width: 2000, height: 1000 },
      view,
    )
    expect(wide.sh).toBeCloseTo(1000, 6)
    expect(wide.sw).toBeLessThan(2000)
  })

  it('eases from the start to the end of a move', () => {
    const plan = {
      from: { x: 0.2, y: 0.2, zoom: 1 },
      to: { x: 0.8, y: 0.8, zoom: 2 },
    }
    expect(cameraAt(plan, 0)).toEqual(plan.from)
    expect(cameraAt(plan, 1)).toEqual(plan.to)
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6)
    expect(cameraAt(plan, 0.25).zoom).toBeLessThan(1.25)
  })

  it('has a gentle default plan for any number of shots', () => {
    const shots = defaultShots(9)
    expect(shots).toHaveLength(9)
    for (const s of shots) {
      expect(Math.max(s.from.zoom, s.to.zoom)).toBeLessThanOrEqual(1.6)
    }
  })
})

describe('encoder command', () => {
  it('takes raw frames from stdin, the voice as audio, and writes H.264 plus AAC for the web', () => {
    const args = buildEncodeArgs({
      width: 1080,
      height: 1920,
      fps: 30,
      audioPath: '/tmp/voice.wav',
      outPath: '/tmp/out.mp4',
      durationSec: 43.0321,
    })
    const text = args.join(' ')
    expect(text).toContain(
      '-f rawvideo -pix_fmt rgba -s 1080x1920 -r 30 -i pipe:0 -i /tmp/voice.wav',
    )
    expect(text).toContain('-c:v libx264')
    expect(text).toContain('-pix_fmt yuv420p')
    expect(text).toContain('-c:a aac')
    expect(text).toContain('-movflags +faststart')
    expect(text).toContain('-t 43.032')
    expect(args[args.length - 1]).toBe('/tmp/out.mp4')
    // Input paths are passed as separate arguments, never through a shell.
    expect(args).toContain('/tmp/voice.wav')
  })
})
