import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  ACCEPT_MAX,
  ACCEPT_MIN,
  judgeFit,
  lengthBudget,
  ratePerSecond,
  spokenUnits,
  tighterBudget,
  totalUnits,
} from '@/services/hook-machine/script-budget.js'
import {
  tightenToBudget,
  translationBudgetPrompt,
} from '@/services/hook-machine/script-fit.js'
import {
  applyFit,
  clampTempo,
  compressionFilter,
  DEFAULT_COMPRESS,
  type FitResult,
  joinForSpeech,
  planSilenceCompression,
  TEMPO_MAX,
  TEMPO_MIN,
  tempoFor,
} from '@/services/hook-machine/voice/fit.js'
import { fitSpeech } from '@/services/video-job/fit-length.js'

describe('length budget', () => {
  it('uses the measured rates for Thai and English', () => {
    expect(ratePerSecond('th')).toBe(10.5)
    expect(ratePerSecond('en')).toBe(3.4)
    // An estimate exists for every other language the app offers.
    for (const code of ['ja', 'zh', 'es', 'id', 'vi']) {
      expect(ratePerSecond(code)).toBeGreaterThan(0)
    }
  })

  it('counts words for English and characters for Thai, and digits as spoken', () => {
    expect(spokenUnits('one two three four', 'en')).toBe(4)
    // Thai counts every character, tone marks included, the way the scoring does.
    expect(spokenUnits('เซรั่ม ขวด นี้', 'th')).toBe(12)
    expect(spokenUnits('thirty ml', 'en')).toBeLessThan(
      spokenUnits('30 ml of serum', 'en') + 1,
    )
    // A number takes longer to say than its digits look.
    expect(spokenUnits('ขนาด 30 มล', 'th')).toBeGreaterThan(
      spokenUnits('ขนาด มล', 'th') + 2,
    )
  })

  it('gives a budget that grows with the length and fits the aim', () => {
    const lengths = [15, 30, 45, 60]
    const budgets = lengths.map((targetSec) =>
      lengthBudget({ targetSec, language: 'en' }),
    )
    for (let i = 1; i < budgets.length; i++) {
      expect(budgets[i]?.totalUnits).toBeGreaterThan(
        budgets[i - 1]?.totalUnits ?? 0,
      )
    }
    for (const b of budgets) {
      // About 97 percent of the chosen length, at the measured rate.
      expect(b.totalUnits / b.rate).toBeLessThanOrEqual(b.targetSec)
      expect(b.totalUnits / b.rate).toBeGreaterThan(b.targetSec * 0.9)
      expect(
        b.hookUnits + b.closingUnits + b.bodyBeatUnits * b.bodyBeats,
      ).toBeLessThanOrEqual(b.totalUnits + 1)
      expect(b.beats).toBeGreaterThanOrEqual(3)
    }
    const thai = lengthBudget({ targetSec: 30, language: 'th' })
    expect(thai.unit).toBe('chars')
    expect(thai.totalUnits).toBeGreaterThan(250)
    expect(thai.totalUnits).toBeLessThan(330)
  })

  it('judges text against the budget', () => {
    const b = lengthBudget({ targetSec: 30, language: 'en' })
    expect(judgeFit(b.totalUnits, b).status).toBe('ok')
    expect(judgeFit(Math.round(b.totalUnits * 1.05), b).status).toBe('ok')
    expect(judgeFit(Math.round(b.totalUnits * 1.2), b).status).toBe('tighten')
    expect(judgeFit(Math.round(b.totalUnits * 0.6), b).status).toBe('short')
    // Under the budget by less than a quarter is fine.
    expect(judgeFit(Math.round(b.totalUnits * 0.8), b).status).toBe('ok')
  })

  it('scales the budget down by how far the audio ran over', () => {
    const b = lengthBudget({ targetSec: 30, language: 'en' })
    const tighter = tighterBudget(b, 40)
    expect(tighter.totalUnits).toBeLessThan(b.totalUnits)
    expect(tighter.totalUnits).toBeGreaterThanOrEqual(
      Math.floor(b.totalUnits * 0.7),
    )
    // Audio that already fits does not change the budget.
    expect(tighterBudget(b, 20).totalUnits).toBe(b.totalUnits)
  })

  it('writes a translation prompt with a total and a limit per line', () => {
    const b = lengthBudget({ targetSec: 15, language: 'en' })
    const prompt = translationBudgetPrompt({
      sourceLines: ['บรรทัดหนึ่งสั้นมาก', 'บรรทัดสองยาวกว่าบรรทัดแรกมากมาย'],
      sourceCode: 'th',
      budget: b,
      languageName: 'English',
    })
    expect(prompt).toContain(`at most ${b.totalUnits} words`)
    expect(prompt).toMatch(/Per line limits, in order: \d+, \d+/)
  })
})

describe('silence compression plan', () => {
  it('shortens long gaps inside the speech, cutting in the middle of the gap', () => {
    const plan = planSilenceCompression(
      [
        { start: 3, end: 3.8 },
        { start: 6, end: 6.3 },
        { start: 9, end: 9.5 },
      ],
      12,
    )
    expect(plan.shortened).toBe(2)
    // 0.8 s becomes 0.3 s and 0.5 s becomes 0.3 s; the 0.3 s gap stays. Each cut is made
    // half a kept gap inside the silence, so no cut lands on a sound.
    expect(plan.savedSec).toBeCloseTo(0.7, 2)
    expect(plan.keep).toEqual([
      { start: 0, end: 3.15 },
      { start: 3.65, end: 9.15 },
      { start: 9.35, end: 12 },
    ])
    expect(plan.durationSec).toBeCloseTo(12 - 0.7, 2)
  })

  it('trims the silence before the first word and after the last one', () => {
    const plan = planSilenceCompression(
      [
        { start: 0, end: 0.9 },
        { start: 7.5, end: 8 },
      ],
      8,
    )
    expect(plan.keep).toEqual([{ start: 0.85, end: 7.75 }])
    expect(plan.shortened).toBe(0)
  })

  it('leaves a take with no gaps as it is', () => {
    const plan = planSilenceCompression([], 10)
    expect(plan.keep).toEqual([{ start: 0, end: 10 }])
    expect(plan.savedSec).toBe(0)
  })

  it('keeps every kept gap long enough for the composer to see it as a pause', () => {
    expect(DEFAULT_COMPRESS.keepGap).toBeGreaterThanOrEqual(0.28)
    // Even after the fastest allowed speed up the gap stays above 0.25 s.
    expect(DEFAULT_COMPRESS.keepGap / TEMPO_MAX).toBeGreaterThan(0.25)
  })

  it('builds one concat filter that uses each kept part', () => {
    const plan = planSilenceCompression([{ start: 3, end: 3.8 }], 8)
    const filter = compressionFilter(plan)
    expect(filter).toContain('atrim=start=0.000:end=3.150')
    expect(filter).toContain('atrim=start=3.650:end=8.000')
    expect(filter).toContain('concat=n=2:v=0:a=1[out]')
    expect(compressionFilter(planSilenceCompression([], 5))).toContain(
      'anull[out]',
    )
  })

  it('joins lines with a space, not a newline', () => {
    expect(joinForSpeech(['one  two', '  three ', ''])).toBe('one two three')
  })
})

describe('tempo', () => {
  it('clamps to the gentle range', () => {
    expect(clampTempo(2)).toBe(TEMPO_MAX)
    expect(clampTempo(0.5)).toBe(TEMPO_MIN)
    expect(clampTempo(1.05)).toBe(1.05)
    expect(TEMPO_MAX).toBeLessThanOrEqual(1.12)
  })

  it('leaves a take inside the range alone', () => {
    expect(tempoFor(30, 30).tempo).toBeNull()
    expect(tempoFor(28, 30).tempo).toBeNull()
    expect(tempoFor(31, 30).tempo).toBeNull()
  })

  it('speeds up a long take and says whether it reaches the range', () => {
    const near = tempoFor(32, 30)
    expect(near.tempo).toBeCloseTo(32 / 30, 2)
    expect(near.reaches).toBe(true)
    const far = tempoFor(36, 30)
    expect(far.tempo).toBe(TEMPO_MAX)
    expect(far.reaches).toBe(false)
    const edge = tempoFor(33, 30)
    expect(edge.tempo).toBe(1.1)
    expect(edge.reaches).toBe(true)
  })

  it('slows a short take a little, never beyond the clamp', () => {
    const slight = tempoFor(24, 30)
    expect(slight.tempo).toBeGreaterThanOrEqual(TEMPO_MIN)
    expect(slight.tempo).toBeLessThan(1)
    expect(slight.reaches).toBe(true)
    // Far too short: the slow down cannot reach the range, and nothing pads it.
    expect(tempoFor(15, 30).reaches).toBe(false)
  })

  it('knows the accepted range', () => {
    expect(ACCEPT_MIN).toBe(0.85)
    expect(ACCEPT_MAX).toBe(1.07)
  })
})

describe('tighten to budget', () => {
  const lines = [
    'one two three four five six seven eight nine ten',
    'a b c d e f g h i j',
  ]
  const budget = lengthBudget({ targetSec: 15, language: 'en' })

  it('does nothing when the lines already fit', async () => {
    const tighten = jest.fn()
    const out = await tightenToBudget({
      lines: ['short line'],
      languageCode: 'en',
      languageName: 'English',
      budget,
      productName: null,
      tighten,
    })
    expect(tighten).not.toHaveBeenCalled()
    expect(out.passes).toBe(0)
  })

  it('tightens at most twice and stops when the reply is not shorter', async () => {
    const long = Array.from({ length: 6 }, () => lines.join(' '))
    const tighten = jest.fn(async (args: { lines: string[] }) =>
      args.lines.slice(0, -1),
    )
    const out = await tightenToBudget({
      lines: long,
      languageCode: 'en',
      languageName: 'English',
      budget,
      productName: null,
      tighten,
    })
    expect(tighten.mock.calls.length).toBeLessThanOrEqual(2)
    expect(totalUnits(out.lines, 'en')).toBeLessThan(totalUnits(long, 'en'))

    const stuck = jest.fn(async (args: { lines: string[] }) => args.lines)
    const same = await tightenToBudget({
      lines: long,
      languageCode: 'en',
      languageName: 'English',
      budget,
      productName: null,
      tighten: stuck,
    })
    expect(stuck).toHaveBeenCalledTimes(1)
    expect(same.lines).toEqual(long)
  })
})

describe('fitSpeech loop with a mocked voice and model', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'fit-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const result = (
    durationSec: number,
    tempo: number | null = null,
  ): FitResult => ({
    durationSec,
    rawDurationSec: durationSec,
    shortened: 3,
    savedSec: 1,
    tempo,
    inRange: durationSec / 30 >= ACCEPT_MIN && durationSec / 30 <= ACCEPT_MAX,
  })

  /** A fit that writes its output file the way the real one does, then reports a length. */
  const fitMock = (durations: number[]) =>
    jest.fn(async (args: { outPath: string }) => {
      await writeFile(args.outPath, 'fit')
      return result(
        durations.length > 1
          ? (durations.shift() as number)
          : (durations[0] as number),
      )
    })

  const base = () => ({
    lines: ['line one is here', 'line two is here', 'line three is here'],
    languageCode: 'en',
    languageName: 'English',
    targetSec: 30,
    productName: 'Pen',
    dir,
    synthesize: jest.fn(async () => Buffer.from('wav')),
  })

  it('accepts the first take when it lands in range', async () => {
    const applyFitMock = fitMock([29])
    const tighten = jest.fn(async (a: { lines: string[] }) => a.lines)
    const out = await fitSpeech({ ...base(), applyFit: applyFitMock, tighten })
    expect(out.inRange).toBe(true)
    expect(out.warnings).toEqual([])
    expect(applyFitMock).toHaveBeenCalledTimes(1)
    expect(tighten).not.toHaveBeenCalled()
    expect(await readFile(out.audioPath, 'utf8')).toBe('fit')
  })

  it('writes fewer words and speaks again when the take is too long even after the speed up', async () => {
    const applyFitMock = fitMock([38, 31])
    const tighten = jest.fn(async (a: { lines: string[] }) =>
      a.lines.slice(0, -1),
    )
    const input = base()
    const out = await fitSpeech({ ...input, applyFit: applyFitMock, tighten })
    expect(tighten).toHaveBeenCalledTimes(1)
    expect(input.synthesize).toHaveBeenCalledTimes(2)
    expect(out.lines).toHaveLength(2)
    expect(out.inRange).toBe(true)
    expect(out.rounds).toBe(2)
  })

  it('stops after two rounds and warns, and still returns the closest take', async () => {
    const applyFitMock = fitMock([45, 40, 37])
    const tighten = jest.fn(async (a: { lines: string[] }) =>
      a.lines.slice(0, -1),
    )
    const input = {
      ...base(),
      lines: [
        'one two three',
        'four five six',
        'seven eight nine',
        'ten eleven twelve',
      ],
    }
    const out = await fitSpeech({ ...input, applyFit: applyFitMock, tighten })
    expect(applyFitMock).toHaveBeenCalledTimes(3)
    expect(out.warnings).toHaveLength(1)
    expect(out.inRange).toBe(false)
    expect(out.durationSec).toBe(37)
  })

  it('accepts a take that is too short with a warning and does not pad it', async () => {
    const applyFitMock = fitMock([20])
    const tighten = jest.fn(async (a: { lines: string[] }) => a.lines)
    const out = await fitSpeech({ ...base(), applyFit: applyFitMock, tighten })
    expect(applyFitMock).toHaveBeenCalledTimes(1)
    expect(out.warnings).toHaveLength(1)
  })

  it('tightens the text before speaking when it is over the budget', async () => {
    const wordy = Array.from(
      { length: 5 },
      () =>
        'many many words are written here to make the text far too long for the budget at all',
    )
    const applyFitMock = fitMock([29])
    const tighten = jest.fn(async (a: { lines: string[] }) =>
      a.lines.slice(0, 2),
    )
    const out = await fitSpeech({
      ...base(),
      lines: wordy,
      targetSec: 15,
      applyFit: applyFitMock,
      tighten,
    })
    expect(tighten).toHaveBeenCalled()
    expect(out.lines.length).toBeLessThan(wordy.length)
  })

  it('skips the whole fit in demo mode', async () => {
    const applyFitMock = jest.fn()
    const out = await fitSpeech({
      ...base(),
      mock: true,
      applyFit: applyFitMock,
    })
    expect(applyFitMock).not.toHaveBeenCalled()
    expect(out.warnings).toEqual([])
  })
})

function ffmpegPath(): string | null {
  for (const bin of ['/opt/homebrew/bin/ffmpeg', 'ffmpeg']) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' })
      return bin
    } catch {
      // try the next one
    }
  }
  return null
}

describe('applyFit with a real ffmpeg', () => {
  const ffmpeg = ffmpegPath()
  const run = ffmpeg ? it : it.skip

  run(
    'shortens a long gap and speeds a long take up into the range',
    async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), 'fit-real-'))
      try {
        const source = path.join(dir, 'source.wav')
        // 2 s tone, 1 s silence, 2 s tone, 1 s silence, 2 s tone = 8 s.
        execFileSync(ffmpeg as string, [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=300:duration=2',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=24000:cl=mono:d=1',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=400:duration=2',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=24000:cl=mono:d=1',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=500:duration=2',
          '-filter_complex',
          '[0][1][2][3][4]concat=n=5:v=0:a=1,aresample=24000[a]',
          '-map',
          '[a]',
          '-ac',
          '1',
          source,
        ])
        const fitted = path.join(dir, 'fit.wav')
        const out = await applyFit({
          inPath: source,
          outPath: fitted,
          targetSec: 6.5,
        })
        expect(out.shortened).toBe(2)
        expect(out.rawDurationSec).toBeCloseTo(8, 1)
        // Two gaps of 1 s became 0.3 s, so about 6.6 s, which is already in range.
        expect(out.durationSec).toBeLessThan(7)
        expect(out.durationSec / 6.5).toBeGreaterThanOrEqual(ACCEPT_MIN)
        expect(out.durationSec / 6.5).toBeLessThanOrEqual(ACCEPT_MAX)
        expect(out.inRange).toBe(true)
        await writeFile(path.join(dir, 'ok'), 'ok')
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    },
  )
})
