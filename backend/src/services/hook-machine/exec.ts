import { execFile } from 'node:child_process'

import { childEnv } from '@/config/hook-machine.config.js'

export class CliError extends Error {
  constructor(
    message: string,
    readonly stderr = '',
    readonly missing = false,
  ) {
    super(message)
    this.name = 'CliError'
  }
}

type RunOptions = { timeoutMs?: number; maxBufferMb?: number }

/** Runs a binary without a shell, so user supplied values never reach one. */
export function runCli(
  bin: string,
  args: string[],
  { timeoutMs = 120_000, maxBufferMb = 32 }: RunOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      args,
      {
        timeout: timeoutMs,
        maxBuffer: maxBufferMb * 1024 * 1024,
        env: childEnv(),
      },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr })
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOENT') {
          return reject(new CliError(`${bin} is not installed`, '', true))
        }
        const tail = stderr.trim().split('\n').slice(-3).join(' | ')
        reject(new CliError(`${bin} failed: ${tail || error.message}`, stderr))
      },
    )
  })
}
