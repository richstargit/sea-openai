// Fitting a finished voice take to the length the user chose: shorten the long
// gaps between phrases, then speed it up or slow it down a little. The plans
// are pure so they can be tested without ffmpeg; applyFit runs the plan.

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { detectPauses, probeDuration } from '@/services/compose/ffmpeg.js'
import { runCli } from '@/services/hook-machine/exec.js'
import {
  ACCEPT_MAX,
  ACCEPT_MIN,
} from '@/services/hook-machine/script-budget.js'

export type Pause = { start: number; end: number }
export type Segment = { start: number; end: number }

/**
 * Lines go to the speech model as one continuous text. A newline between
 * lines makes it stop for a long breath, a plain space keeps the phrasing
 * of ordinary speech (measured: Thai 31.3 s with newlines, 28.0 s with spaces).
 */
export function joinForSpeech(lines: string[]): string {
  return lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
}

export type CompressOptions = {
  /** Gaps longer than this are shortened. */
  maxGap: number
  /** A shortened gap keeps this much silence. It must stay long enough for the composer to still see it as a pause (it looks for 0.25 s). */
  keepGap: number
  /** Silence kept before the first word and after the last one. */
  lead: number
  trail: number
}

export const DEFAULT_COMPRESS: CompressOptions = {
  maxGap: 0.4,
  keepGap: 0.3,
  lead: 0.05,
  trail: 0.25,
}

export type CompressPlan = {
  /** The parts of the take to keep, in order. */
  keep: Segment[]
  /** Length of the result in seconds. */
  durationSec: number
  /** How many gaps were shortened. */
  shortened: number
  savedSec: number
}

/**
 * Decides which parts of the take to keep. Each long gap is cut in the middle
 * so the cut lands inside silence, not on a sound.
 */
export function planSilenceCompression(
  pauses: Pause[],
  totalSec: number,
  options: CompressOptions = DEFAULT_COMPRESS,
): CompressPlan {
  const sorted = [...pauses]
    .filter((p) => p.end > p.start)
    .sort((a, b) => a.start - b.start)

  let start = 0
  let end = totalSec
  const first = sorted[0]
  if (first && first.start <= 0.05 && first.end - options.lead > 0) {
    start = Math.max(0, first.end - options.lead)
  }
  const last = sorted[sorted.length - 1]
  if (last && last.end >= totalSec - 0.05) {
    end = Math.min(totalSec, last.start + options.trail)
  }
  if (end <= start) return plain(totalSec)

  const keep: Segment[] = []
  let cursor = start
  let shortened = 0
  for (const p of sorted) {
    // Only gaps strictly inside the speech are compressed.
    if (p.start <= start + 0.05 || p.end >= end - 0.05) continue
    const length = p.end - p.start
    if (length <= options.maxGap) continue
    const half = options.keepGap / 2
    const cutStart = p.start + half
    const cutEnd = p.end - half
    if (cutEnd <= cutStart) continue
    if (cutStart > cursor) keep.push({ start: cursor, end: cutStart })
    cursor = cutEnd
    shortened += 1
  }
  if (end > cursor) keep.push({ start: cursor, end })

  const duration = keep.reduce((sum, s) => sum + (s.end - s.start), 0)
  return {
    keep,
    durationSec: round(duration),
    shortened,
    savedSec: round(totalSec - duration),
  }

  function plain(total: number): CompressPlan {
    return {
      keep: [{ start: 0, end: total }],
      durationSec: round(total),
      shortened: 0,
      savedSec: 0,
    }
  }
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** The ffmpeg filter that cuts the plan out and joins the parts back to back. */
export function compressionFilter(plan: CompressPlan): string {
  const parts = plan.keep.map(
    (seg, i) =>
      `[0:a]atrim=start=${seg.start.toFixed(3)}:end=${seg.end.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`,
  )
  const labels = plan.keep.map((_, i) => `[a${i}]`).join('')
  if (plan.keep.length === 1) return `${parts[0]};[a0]anull[out]`
  return `${parts.join(';')};${labels}concat=n=${plan.keep.length}:v=0:a=1[out]`
}

/** ffmpeg's atempo works between 0.5 and 100, but speech only sounds right in a narrow range. */
export const TEMPO_MIN = 0.92
export const TEMPO_MAX = 1.12

export const clampTempo = (tempo: number): number =>
  Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, tempo))

/**
 * What speed change brings a take of `durationSec` close to the target.
 * Inside the accepted range nothing is changed, so a good take is left alone.
 * Returns the wanted tempo (clamped) and whether it reaches the target.
 */
export function tempoFor(
  durationSec: number,
  targetSec: number,
): { tempo: number | null; resultSec: number; reaches: boolean } {
  if (durationSec <= 0 || targetSec <= 0) {
    return { tempo: null, resultSec: durationSec, reaches: false }
  }
  const share = durationSec / targetSec
  // Leave a take alone when it is already comfortably inside the range.
  if (share >= 0.9 && share <= 1.04) {
    return { tempo: null, resultSec: durationSec, reaches: true }
  }
  // Aim at the middle of the safe range so there is a margin on both sides.
  const aim = share > 1 ? 1.0 : 0.92
  const wanted = durationSec / (targetSec * aim)
  const tempo = clampTempo(wanted)
  const resultSec = durationSec / tempo
  const resultShare = resultSec / targetSec
  return {
    tempo: Math.abs(tempo - 1) < 0.005 ? null : Math.round(tempo * 1000) / 1000,
    resultSec: round(resultSec),
    reaches: resultShare >= ACCEPT_MIN && resultShare <= ACCEPT_MAX,
  }
}

export type FitResult = {
  durationSec: number
  rawDurationSec: number
  shortened: number
  savedSec: number
  tempo: number | null
  /** True when the final length is inside the accepted range. */
  inRange: boolean
}

/** Cuts the long gaps, then changes the speed if the take is still outside the range. */
export async function applyFit(args: {
  inPath: string
  outPath: string
  targetSec: number
}): Promise<FitResult> {
  const raw = await probeDuration(args.inPath)
  const pauses = await detectPauses(args.inPath, raw)
  const plan = planSilenceCompression(pauses, raw)
  const afterCut = plan.durationSec
  const speed = tempoFor(afterCut, args.targetSec)

  const filter = [
    compressionFilter(plan).replace('[out]', speed.tempo ? '[cut]' : '[out]'),
    speed.tempo ? `[cut]atempo=${speed.tempo}[out]` : null,
  ]
    .filter(Boolean)
    .join(';')

  await runCli(
    hookMachineConfig.ffmpegBin,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      args.inPath,
      '-filter_complex',
      filter,
      '-map',
      '[out]',
      '-ar',
      '24000',
      '-ac',
      '1',
      '-c:a',
      'pcm_s16le',
      args.outPath,
    ],
    { timeoutMs: 120_000 },
  )

  const final = await probeDuration(args.outPath)
  const share = final / args.targetSec
  return {
    durationSec: round(final),
    rawDurationSec: round(raw),
    shortened: plan.shortened,
    savedSec: plan.savedSec,
    tempo: speed.tempo,
    inRange: share >= ACCEPT_MIN && share <= ACCEPT_MAX,
  }
}
