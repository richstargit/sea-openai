import os from 'node:os'
import path from 'node:path'

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export const hookMachineConfig = {
  dataDir: path.resolve(process.env.HOOK_MACHINE_DATA_DIR?.trim() || 'data'),
  agentReachBin: process.env.AGENT_REACH_BIN?.trim() || 'agent-reach',
  ytDlpBin: process.env.YT_DLP_BIN?.trim() || 'yt-dlp',
  ffmpegBin: process.env.FFMPEG_BIN?.trim() || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN?.trim() || 'ffprobe',
  transcribeModel:
    process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || 'gpt-4o-mini-transcribe',
  voiceTranscribeModel:
    process.env.OPENAI_VOICE_TRANSCRIBE_MODEL?.trim() || 'gpt-transcribe',
  voiceJudgeModel:
    process.env.OPENAI_VOICE_JUDGE_MODEL?.trim() || 'gpt-audio-1.5',
  // Demo mode answers the AI steps with canned data so the UI can be explored
  // without an OpenAI key. Collection (Agent-Reach, yt-dlp, ffmpeg) stays real.
  mockAi: process.env.HOOK_MACHINE_MOCK_AI === 'true',
  maxSourcesPerProfile: positiveInt(process.env.HOOK_MACHINE_MAX_SOURCES, 20),
  sourceConcurrency: positiveInt(process.env.HOOK_MACHINE_CONCURRENCY, 2),
  // Only the opening of each clip is downloaded and transcribed.
  clipSeconds: positiveInt(process.env.HOOK_MACHINE_CLIP_SECONDS, 75),
  hookSeconds: 10,
  tmpDir: path.join(os.tmpdir(), 'hook-machine'),
}

export function childEnv(): NodeJS.ProcessEnv {
  const extra = [path.join(os.homedir(), '.local', 'bin'), '/opt/homebrew/bin']
  const current = process.env.PATH ?? ''
  return { ...process.env, PATH: [...extra, current].join(path.delimiter) }
}
