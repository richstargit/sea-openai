import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export const filmFps = 30

export function frameDiscontinuities(frames) {
  const findings = []
  for (let index = 1; index < frames.length; index++) {
    const frame = frames[index]
    const interval = frame.time - frames[index - 1].time
    if (Math.abs(interval - 1 / filmFps) > 0.002) {
      findings.push({ time: frame.time, issue: 'uneven frame timing' })
      continue
    }
    const nearby = frames.slice(Math.max(1, index - 6), index + 7)
      .filter((item) => item !== frame).map((item) => item.change).sort((a, b) => a - b)
    const typical = nearby[Math.floor(nearby.length / 2)] ?? 0
    if (frame.change > Math.max(2, typical * 5 + 0.6)) {
      findings.push({ time: frame.time, issue: 'abrupt visual change' })
    }
  }
  return findings
}

export async function inspectContinuousRender(file, signal) {
  const { stdout } = await exec('ffmpeg', [
    '-v', 'error', '-i', file, '-an', '-vf',
    'scale=128:-2:flags=area,format=yuv420p,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=-',
    '-f', 'null', '-',
  ], { signal, timeout: 100000, maxBuffer: 4 * 1024 * 1024 })
  const frames = Array.from(stdout.matchAll(/pts_time:([\d.e+-]+)\s+lavfi\.signalstats\.YDIF=([\d.e+-]+)/g),
    ([, time, change]) => ({ time: Number(time), change: Number(change) }))
  if (frames.length < 2) throw new Error('Could not measure the rendered frames')
  const issues = frameDiscontinuities(frames)
  if (frames.every((frame) => frame.change < 0.12)) issues.push({ time: 0, issue: 'no visible movement' })
  if (issues.length) {
    const error = new Error(issues.slice(0, 5).map(({ time, issue }) => `${issue} at ${time.toFixed(2)}s`).join(', '))
    error.name = 'ContinuityError'
    throw error
  }
  return frames.length
}
