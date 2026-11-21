import type { CaptionPage, TimedBeat } from '@/services/compose/types.js'

const EMOJI = /\p{Extended_Pictographic}|\uFE0F|\u200D/gu

/**
 * What is allowed on screen: no quotation marks, dashes, middle dots or
 * emoji, no full stop at the end of a line, and a full stop between two
 * sentences becomes a plain space.
 */
export function cleanCaption(text: string): string {
  return text
    .replace(/["“”‘’«»`]/g, '')
    .replace(/[-‐-―−·•∙]/g, ' ')
    .replace(EMOJI, '')
    .replace(/(?<!\d)\.(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Word pieces that are safe to break between, spaces kept with the word before them. */
export function breakUnits(text: string, locale = 'th'): string[] {
  const segmenter = new Intl.Segmenter(locale, { granularity: 'word' })
  const units: string[] = []
  for (const part of segmenter.segment(text)) {
    const piece = part.segment
    if (/^\s+$/.test(piece)) {
      if (units.length > 0) units[units.length - 1] += piece
      continue
    }
    units.push(piece)
  }
  return units
}

type WrappedLine = { text: string; atSpace: boolean }

/**
 * Fills a line with word pieces. When a line overflows, a break at a space in
 * the source (a phrase boundary) wins over a break inside a phrase whenever the
 * phrase that moves down fits on a line. Each line says whether it ended at a space.
 */
function greedy(
  units: string[],
  measure: (text: string) => number,
  maxWidth: number,
): WrappedLine[] {
  const lines: WrappedLine[] = []
  let line: string[] = []
  const widthOf = (parts: string[]) => measure(parts.join('').trimEnd())
  const close = (parts: string[]) =>
    lines.push({
      text: parts.join('').trimEnd(),
      atSpace: /\s$/.test(parts[parts.length - 1] ?? ''),
    })

  for (const unit of units) {
    if (line.length > 0 && widthOf([...line, unit]) > maxWidth) {
      // A phrase that fits on a line by itself moves down whole, however short the
      // line it leaves behind. Only a phrase wider than a line is cut inside.
      let cut = line.length
      for (let k = line.length - 1; k >= 1; k--) {
        const strong = /\s$/.test(line[k - 1] ?? '')
        if (strong && widthOf([...line.slice(k), unit]) <= maxWidth) {
          cut = k
          break
        }
      }
      close(line.slice(0, cut))
      line = [...line.slice(cut), unit]
      while (line.length > 1 && widthOf(line) > maxWidth) {
        // Carried words plus the new one are still too wide: close what fits.
        close(line.slice(0, -1))
        line = [line[line.length - 1] ?? '']
      }
      if (line[0]) line[0] = line[0].trimStart()
    } else {
      line.push(unit)
    }
  }
  if (line.join('').trim() !== '') close(line)
  return lines
}

const innerBreaks = (lines: WrappedLine[]) =>
  lines.slice(0, -1).filter((l) => !l.atSpace).length

/**
 * Wraps text to a width without splitting a Thai word, then narrows the
 * width as far as it can without adding a line, so the last line is never a
 * lonely short word. Narrowing is refused when it would add a break inside a
 * phrase: the Thai segmenter splits unfamiliar words (brand names) into
 * syllables, and a caption must not cut those in half.
 */
export function wrapBalanced(
  text: string,
  measure: (text: string) => number,
  maxWidth: number,
): string[] {
  const units = breakUnits(text)
  const first = greedy(units, measure, maxWidth)
  if (first.length <= 1) return first.map((l) => l.text)

  const widest = units.reduce((m, u) => Math.max(m, measure(u.trim())), 0)
  let low = Math.max(widest, 1)
  let high = maxWidth
  let best = first
  const allowed = innerBreaks(first)
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2
    const trial = greedy(units, measure, mid)
    if (trial.length <= first.length && innerBreaks(trial) <= allowed) {
      best = trial
      high = mid
    } else {
      low = mid
    }
  }
  return best.map((l) => l.text)
}

export function toPages(lines: string[], maxLines = 2): string[][] {
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += maxLines) {
    pages.push(lines.slice(i, i + maxLines))
  }
  // A page of one short line after a full page reads better merged back.
  const last = pages[pages.length - 1]
  const before = pages[pages.length - 2]
  if (last && before && last.length === 1 && before.length === maxLines) {
    const tail = last[0] ?? ''
    if (tail.length <= 8) {
      pages.pop()
      const merged = before.slice()
      merged[merged.length - 1] = `${merged[merged.length - 1] ?? ''} ${tail}`
      pages[pages.length - 1] = merged
    }
  }
  return pages
}

/** Spreads the pages of one beat over its time, by how much text each holds. */
export function pageTimings(
  pages: string[][],
  startSec: number,
  endSec: number,
): CaptionPage[] {
  const sizes = pages.map((p) => p.join('').replace(/\s+/g, '').length || 1)
  const total = sizes.reduce((a, b) => a + b, 0)
  const out: CaptionPage[] = []
  let cursor = startSec
  pages.forEach((lines, i) => {
    const share = ((sizes[i] ?? 1) / total) * (endSec - startSec)
    const end = i === pages.length - 1 ? endSec : cursor + share
    out.push({ startSec: cursor, endSec: end, lines })
    cursor = end
  })
  return out
}

export function buildCaptionPages(
  beats: TimedBeat[],
  measure: (text: string) => number,
  maxWidth: number,
  maxLines = 2,
): CaptionPage[][] {
  return beats.map((beat) => {
    const text = cleanCaption(beat.text)
    const lines = wrapBalanced(text, measure, maxWidth)
    return pageTimings(toPages(lines, maxLines), beat.startSec, beat.endSec)
  })
}

/**
 * The largest font size, between minPx and maxPx, at which every
 * space-separated phrase fits on one line. The Thai segmenter cuts unfamiliar
 * words into syllables, so the safest caption never has to cut a phrase.
 * Returns minPx when even that is too big (the wrapper then breaks as it can).
 */
export function largestFittingFont(
  phrases: string[],
  measureAt: (fontPx: number) => (text: string) => number,
  maxWidth: number,
  maxPx: number,
  minPx: number,
  step = 2,
): number {
  for (let px = maxPx; px > minPx; px -= step) {
    const measure = measureAt(px)
    if (phrases.every((phrase) => measure(phrase) <= maxWidth)) return px
  }
  return minPx
}

export function phrasesOf(texts: string[]): string[] {
  return texts.flatMap((t) => cleanCaption(t).split(' ')).filter(Boolean)
}
