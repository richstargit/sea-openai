import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'

const exec = promisify(execFile)
export const sandboxRoot = '/home/node/workspace'

export async function runVideoSandbox(
  directory: string,
  args: string[],
  signal: AbortSignal,
) {
  const name = `sea-film-${randomUUID()}`
  const image =
    process.env.VIDEO_SANDBOX_IMAGE?.trim() || 'sea-video-sandbox:0.9.75'
  try {
    return await exec(
      'docker',
      [
        'run',
        '--rm',
        '--name',
        name,
        '--init',
        '--network',
        'none',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--read-only',
        '--memory',
        '3g',
        '--cpus',
        '4',
        '--pids-limit',
        '512',
        '--shm-size',
        '384m',
        '--user',
        `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
        '--tmpfs',
        '/tmp:rw,nosuid,size=1g',
        '--env',
        'HOME=/tmp/home',
        '--mount',
        `type=bind,source=${directory},target=${sandboxRoot}`,
        '--workdir',
        sandboxRoot,
        image,
        ...args,
      ],
      { signal, timeout: 180_000, maxBuffer: 3 * 1024 * 1024 },
    )
  } finally {
    await exec('docker', ['rm', '-f', name], { timeout: 10000 }).catch(
      () => undefined,
    )
  }
}
