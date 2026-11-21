import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { parseSilenceDetect } from '@/services/compose/timeline.js'
import type { Pause } from '@/services/compose/types.js'
import { runCli } from '@/services/hook-machine/exec.js'

export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await runCli(
    hookMachineConfig.ffprobeBin,
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { timeoutMs: 30_000 },
  )
  const value = Number.parseFloat(stdout)
  if (!Number.isFinite(value) || value <= 0)
    throw new Error('could not read the audio length')
  return value
}

export async function detectPauses(
  file: string,
  totalSec: number,
  { noiseDb = -35, minSec = 0.25 } = {},
): Promise<Pause[]> {
  const { stderr } = await runCli(
    hookMachineConfig.ffmpegBin,
    [
      '-hide_banner',
      '-nostats',
      '-i',
      file,
      '-af',
      `silencedetect=noise=${noiseDb}dB:d=${minSec}`,
      '-f',
      'null',
      '-',
    ],
    { timeoutMs: 60_000 },
  )
  return parseSilenceDetect(stderr, totalSec)
}

export type EncodeOptions = {
  width: number
  height: number
  fps: number
  audioPath: string
  outPath: string
  durationSec: number
}

/** Raw frames arrive on stdin; the voice is the second input. H.264 plus AAC, web friendly. */
export function buildEncodeArgs(o: EncodeOptions): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'rgba',
    '-s',
    `${o.width}x${o.height}`,
    '-r',
    String(o.fps),
    '-i',
    'pipe:0',
    '-i',
    o.audioPath,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(o.fps),
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-t',
    o.durationSec.toFixed(3),
    '-movflags',
    '+faststart',
    o.outPath,
  ]
}
