import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import type { VideoMeta } from '@/services/hook-machine/collectors/agent-reach.js'
import { runCli } from '@/services/hook-machine/exec.js'

const bin = () => hookMachineConfig.ytDlpBin

export async function ytdlpAvailable(): Promise<boolean> {
  try {
    await runCli(bin(), ['--version'], { timeoutMs: 15_000 })
    return true
  } catch {
    return false
  }
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateFrom(info: Record<string, unknown>): string | null {
  const raw = info.upload_date
  if (typeof raw !== 'string' || !/^\d{8}$/.test(raw)) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

export async function ytdlpMeta(url: string): Promise<VideoMeta> {
  const { stdout } = await runCli(
    bin(),
    [
      '--skip-download',
      '--dump-single-json',
      '--no-warnings',
      '--no-playlist',
      '--',
      url,
    ],
    { timeoutMs: 60_000 },
  )
  const info = JSON.parse(stdout) as Record<string, unknown>
  const text = (key: string) =>
    typeof info[key] === 'string' ? (info[key] as string) : null
  return {
    title: text('title') ?? text('fulltitle'),
    author: text('uploader') ?? text('channel'),
    publishedAt: dateFrom(info),
    description: text('description'),
    durationSec: num(info.duration),
    views: num(info.view_count),
    likes: num(info.like_count),
  }
}

/** Downloads only the opening of the clip, at most 720p. */
export async function ytdlpDownload(url: string, dir: string): Promise<string> {
  const base = [
    '-f',
    'bv*[height<=720]+ba/b[height<=720]/b',
    '--merge-output-format',
    'mp4',
    '-o',
    path.join(dir, 'video.%(ext)s'),
    '--no-playlist',
    '--no-warnings',
    '--max-filesize',
    '300M',
  ]
  const section = ['--download-sections', `*0-${hookMachineConfig.clipSeconds}`]
  try {
    await runCli(bin(), [...base, ...section, '--', url], {
      timeoutMs: 180_000,
    })
  } catch {
    // Some extractors cannot cut sections; short-form clips are fine whole.
    await runCli(bin(), [...base, '--', url], { timeoutMs: 240_000 })
  }
  const files = await readdir(dir)
  const video = files.find((file) => /^video\.(mp4|mkv|webm|mov)$/.test(file))
  if (!video) throw new Error('yt-dlp finished without producing a video file')
  return path.join(dir, video)
}

/** Strips WebVTT cue timing and inline tags, and drops repeated rolling lines. */
export function vttToText(vtt: string): string {
  const lines: string[] = []
  for (const raw of vtt.split('\n')) {
    const line = raw.trim()
    if (
      !line ||
      line === 'WEBVTT' ||
      line.startsWith('Kind:') ||
      line.startsWith('Language:') ||
      line.startsWith('NOTE') ||
      line.includes('-->')
    ) {
      continue
    }
    const clean = line.replace(/<[^>]+>/g, '').trim()
    if (clean && clean !== lines[lines.length - 1]) lines.push(clean)
  }
  return lines.join('\n')
}

export async function ytdlpSubtitles(
  url: string,
  dir: string,
): Promise<string> {
  try {
    await runCli(
      bin(),
      [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-langs',
        'th.*,en.*',
        '--sub-format',
        'vtt',
        '-o',
        path.join(dir, 'subs.%(ext)s'),
        '--no-playlist',
        '--no-warnings',
        '--',
        url,
      ],
      { timeoutMs: 60_000 },
    )
  } catch {
    return ''
  }
  const files = (await readdir(dir)).filter((file) => file.endsWith('.vtt'))
  // Prefer Thai, then whatever came first.
  files.sort((a, b) => Number(b.includes('.th')) - Number(a.includes('.th')))
  const first = files[0]
  return first ? vttToText(await readFile(path.join(dir, first), 'utf8')) : ''
}
