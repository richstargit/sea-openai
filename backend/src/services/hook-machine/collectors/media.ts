import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { runCli } from '@/services/hook-machine/exec.js'

export async function ffmpegAvailable(): Promise<boolean> {
  try {
    await runCli(hookMachineConfig.ffmpegBin, ['-version'], {
      timeoutMs: 15_000,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Hook microscope: one frame per second across the opening seconds, as
 * small JPEG data URLs ready for a vision model.
 */
export async function hookFrames(
  video: string,
  dir: string,
): Promise<{ second: number; dataUrl: string }[]> {
  await runCli(
    hookMachineConfig.ffmpegBin,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-t',
      String(hookMachineConfig.hookSeconds),
      '-i',
      video,
      '-vf',
      'fps=1,scale=512:-2',
      '-q:v',
      '5',
      path.join(dir, 'hook_%02d.jpg'),
    ],
    { timeoutMs: 60_000 },
  )
  const files = (await readdir(dir))
    .filter((f) => /^hook_\d+\.jpg$/.test(f))
    .sort()
  return Promise.all(
    files.map(async (file, index) => ({
      second: index,
      dataUrl: `data:image/jpeg;base64,${(await readFile(path.join(dir, file))).toString('base64')}`,
    })),
  )
}

export type Pacing = {
  shots: number
  cutsPerMinute: number
  avgShotSec: number
}

/** Counts hard cuts with ffmpeg's scene detector (threshold 0.3). */
export async function pacing(video: string): Promise<Pacing | null> {
  let stderr: string
  try {
    ;({ stderr } = await runCli(
      hookMachineConfig.ffmpegBin,
      [
        '-hide_banner',
        '-y',
        '-i',
        video,
        '-vf',
        "select='gt(scene,0.3)',showinfo",
        '-an',
        '-f',
        'null',
        '-',
      ],
      { timeoutMs: 120_000 },
    ))
  } catch {
    return null
  }
  const cuts = (stderr.match(/pts_time:/g) ?? []).length
  const duration = await durationOf(video)
  if (!duration) return null
  const shots = cuts + 1
  return {
    shots,
    cutsPerMinute: Math.round((cuts / duration) * 60 * 10) / 10,
    avgShotSec: Math.round((duration / shots) * 10) / 10,
  }
}

async function durationOf(video: string): Promise<number | null> {
  try {
    const { stdout } = await runCli(
      hookMachineConfig.ffprobeBin,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'csv=p=0',
        video,
      ],
      { timeoutMs: 20_000 },
    )
    const value = Number.parseFloat(stdout)
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** Mono 16 kHz mp3 of the opening seconds: small enough for a speech API. */
export async function extractAudio(
  video: string,
  dir: string,
): Promise<string> {
  const out = path.join(dir, 'audio.mp3')
  await runCli(
    hookMachineConfig.ffmpegBin,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      video,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-b:a',
      '64k',
      '-t',
      String(hookMachineConfig.clipSeconds),
      out,
    ],
    { timeoutMs: 90_000 },
  )
  return out
}
