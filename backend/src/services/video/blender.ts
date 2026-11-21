import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { AppError } from '@/services/error.service.js'
import { colors, type VideoBrief } from '@/services/video/brief.js'

const queue = join(homedir(), '.sea-openai', 'blender')
export async function blenderOnline() {
  const heartbeat = await stat(join(queue, 'online')).catch(() => null)
  return !!heartbeat && Date.now() - heartbeat.mtimeMs < 10000
}
export async function blenderFrames(brief: VideoBrief, signal: AbortSignal) {
  if (!(await blenderOnline()))
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: 'so-blender-offline',
      message: 'เปิด Blender ที่เชื่อมกับ Studio แล้วลองอีกครั้ง',
    })
  const folder = join(queue, randomUUID())
  await mkdir(folder, { mode: 0o700 })
  try {
    await writeFile(
      join(folder, 'job.tmp'),
      JSON.stringify({
        subject: brief.subject,
        color: colors[brief.color].slice(1),
      }),
    )
    await rename(join(folder, 'job.tmp'), join(folder, 'ready.json'))
    while (!(await stat(join(folder, 'done')).catch(() => null))) {
      if (await stat(join(folder, 'failure')).catch(() => null))
        throw new AppError('SERVICE_UNAVAILABLE', {
          key: 'so-blender-render-failed',
        })
      await wait(250, undefined, { signal })
    }
    return await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        readFile(join(folder, `${String(i).padStart(2, '0')}.png`)),
      ),
    )
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
