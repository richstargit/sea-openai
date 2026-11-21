import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

export function liveScriptConfig() {
  return {
    // Shares the Hook Machine data root so one setting moves everything.
    dataDir: path.join(hookMachineConfig.dataDir, 'live-scripts'),
    maxImages: 4,
    maxConcurrent: positiveInt(process.env.LIVE_SCRIPT_MAX_CONCURRENT, 2),
    timeoutMs: positiveInt(process.env.LIVE_SCRIPT_TIMEOUT_MS, 10 * 60 * 1000),
    keepPerOwner: 30,
    listLimit: 30,
    sessionIdleMs: positiveInt(
      process.env.LIVE_SCRIPT_SESSION_IDLE_MS,
      4 * 60 * 60 * 1000,
    ),
    /** Only the last minute of speech is used to decide what the seller is talking about. */
    windowMs: 60_000,
    /** The most one suggestion may take before the playbook answers instead. */
    suggestTimeoutMs: positiveInt(
      process.env.LIVE_SCRIPT_SUGGEST_TIMEOUT_MS,
      5000,
    ),
  }
}
