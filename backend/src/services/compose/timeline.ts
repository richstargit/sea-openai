import type {
  AlignMethod,
  Beat,
  Pause,
  TimedBeat,
} from '@/services/compose/types.js'

/** Reads the lines ffmpeg's silencedetect filter writes to stderr. */
export function parseSilenceDetect(stderr: string, totalSec: number): Pause[] {
  const pauses: Pause[] = []
  let open: number | null = null
  for (const line of stderr.split('\n')) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/)
    if (start?.[1] !== undefined) {
      open = Math.max(0, Number(start[1]))
      continue
    }
    const end = line.match(/silence_end:\s*(-?[\d.]+)/)
    if (end?.[1] !== undefined && open !== null) {
      pauses.push({ start: open, end: Number(end[1]) })
      open = null
    }
  }
  // Silence that runs to the end of the file never prints an end line.
  if (open !== null) pauses.push({ start: open, end: totalSec })
  return pauses
}

const countable = (text: string) => text.replace(/\s+/g, '').length

/** Where each cut would fall if speech spread evenly over the characters. */
export function expectedBoundaries(
  texts: string[],
  start: number,
  end: number,
): number[] {
  const sizes = texts.map(countable)
  const total = sizes.reduce((a, b) => a + b, 0) || 1
  const cuts: number[] = []
  let run = 0
  for (let i = 0; i < texts.length - 1; i++) {
    run += sizes[i] ?? 0
    cuts.push(start + ((end - start) * run) / total)
  }
  return cuts
}

/** The part of the file that holds speech, without leading or trailing silence. */
export function speechBounds(
  pauses: Pause[],
  totalSec: number,
): { start: number; end: number } {
  let start = 0
  let end = totalSec
  const first = pauses[0]
  if (first && first.start <= 0.05) start = first.end
  const last = pauses[pauses.length - 1]
  if (last && last.end >= totalSec - 0.05) end = last.start
  return end > start ? { start, end } : { start: 0, end: totalSec }
}

export type Alignment = {
  beats: TimedBeat[]
  method: AlignMethod
  pausesFound: number
  meanShiftSec: number
}

/**
 * Cuts the video where the voice actually changes line. The script's own
 * times assume a different speaking speed, so they are ignored. Each cut is
 * snapped to a pause near where the character count says it should be, and
 * falls back to the character count when no pause fits.
 */
export function alignBeats(
  beats: Beat[],
  pauses: Pause[],
  totalSec: number,
): Alignment {
  const texts = beats.map((b) => b.voiceover)
  const speech = speechBounds(pauses, totalSec)
  const expected = expectedBoundaries(texts, speech.start, speech.end)
  const interior = pauses.filter(
    (p) => p.start > speech.start + 0.05 && p.end < speech.end - 0.05,
  )
  const tolerance = Math.max(0.6, 0.18 * (speech.end - speech.start))

  const cuts: number[] = []
  let snapped = 0
  let shift = 0
  let previous = 0
  for (const want of expected) {
    let best: { mid: number; cost: number } | null = null
    // Leave room for the cuts still to come, so no shot is squeezed to nothing.
    const floor = previous + 0.4
    for (const p of interior) {
      const mid = (p.start + p.end) / 2
      if (mid <= floor) continue
      const away = Math.abs(mid - want)
      if (away > tolerance) continue
      // A long pause is more likely to be a real gap between lines than a comma.
      const cost = away - 0.6 * Math.min(p.end - p.start, 1.2)
      if (!best || cost < best.cost) best = { mid, cost }
    }
    const cut = best ? best.mid : Math.max(want, floor)
    if (best) snapped += 1
    shift += Math.abs(cut - want)
    cuts.push(cut)
    previous = cut
  }

  const edges = [0, ...cuts, totalSec]
  const timed: TimedBeat[] = beats.map((beat, index) => ({
    index,
    startSec: edges[index] ?? 0,
    endSec: edges[index + 1] ?? totalSec,
    text: beat.voiceover,
    imageIndex: beat.imageIndex ?? 0,
  }))

  const cutCount = Math.max(1, cuts.length)
  const method: AlignMethod =
    cuts.length === 0 || snapped === 0
      ? 'proportional'
      : snapped === cuts.length
        ? 'pauses'
        : 'mixed'
  return {
    beats: timed,
    method,
    pausesFound: interior.length,
    meanShiftSec: Math.round((shift / cutCount) * 1000) / 1000,
  }
}
