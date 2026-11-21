import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'

import { liveScriptConfig } from '@/services/live-script/config.js'
import { SHOW_ERRORS } from '@/services/live-script/errors.js'
import type { LiveShowDoc } from '@/services/live-script/types.js'

const UUID = /^[0-9a-f-]{36}$/
const queues = new Map<string, Promise<unknown>>()

// Shows running in this process. A show still marked running that is not in
// this map was cut off by a restart.
const active = new Map<string, string>()

export const activeShowCount = () => active.size
export const isOwnerBusy = (ownerId: string) =>
  [...active.values()].includes(ownerId)
export const isShowRunning = (id: string) => active.has(id)
export const markActive = (id: string, ownerId: string) =>
  active.set(id, ownerId)
export const markIdle = (id: string) => active.delete(id)

const dir = () => liveScriptConfig().dataDir
const fileFor = (id: string) => path.join(dir(), `${id}.json`)

async function readRaw(id: string): Promise<LiveShowDoc | null> {
  if (!UUID.test(id)) return null
  try {
    return JSON.parse(await readFile(fileFor(id), 'utf8')) as LiveShowDoc
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function writeAtomic(doc: LiveShowDoc): Promise<void> {
  await mkdir(dir(), { recursive: true })
  const file = fileFor(doc.id)
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(doc, null, 2))
  await rename(tmp, file)
}

export async function createShow(doc: LiveShowDoc): Promise<LiveShowDoc> {
  await writeAtomic(doc)
  return doc
}

export function updateShow(
  id: string,
  change: (doc: LiveShowDoc) => void,
): Promise<LiveShowDoc> {
  const run = (queues.get(id) ?? Promise.resolve()).then(async () => {
    const doc = await readRaw(id)
    if (!doc) throw new Error(`live show ${id} not found`)
    change(doc)
    await writeAtomic(doc)
    return doc
  })
  queues.set(
    id,
    run.catch(() => undefined),
  )
  return run
}

export async function deleteShowFile(id: string): Promise<void> {
  if (!UUID.test(id)) return
  const run = (queues.get(id) ?? Promise.resolve()).then(() =>
    rm(fileFor(id), { force: true }),
  )
  queues.set(
    id,
    run.catch(() => undefined),
  )
  await run
}

function closeOut(doc: LiveShowDoc) {
  doc.status = 'error'
  doc.step = null
  doc.errorCode = 'restart'
  doc.error = SHOW_ERRORS.restart
}

/**
 * The only read used by routes. Someone else's show reads as missing so ids
 * cannot be probed, and a show orphaned by a restart is closed out here.
 */
export async function readOwnedShow(
  ownerId: string,
  id: string,
): Promise<LiveShowDoc | null> {
  const doc = await readRaw(id)
  if (!doc || doc.ownerId !== ownerId) return null
  if (doc.status === 'running' && !isShowRunning(id)) {
    return updateShow(id, closeOut)
  }
  return doc
}

async function allShows(): Promise<LiveShowDoc[]> {
  let names: string[]
  try {
    names = await readdir(dir())
  } catch {
    return []
  }
  const shows: LiveShowDoc[] = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const doc = await readRaw(name.slice(0, -5)).catch(() => null)
    if (doc) shows.push(doc)
  }
  return shows
}

export async function listOwnedShows(
  ownerId: string,
  limit = liveScriptConfig().listLimit,
): Promise<LiveShowDoc[]> {
  const mine = (await allShows()).filter((d) => d.ownerId === ownerId)
  const out: LiveShowDoc[] = []
  for (const doc of mine) {
    out.push(
      doc.status === 'running' && !isShowRunning(doc.id)
        ? await updateShow(doc.id, closeOut)
        : doc,
    )
  }
  return out
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

/** Keeps the newest finished shows of an account and deletes the rest. */
export async function pruneOldShows(ownerId: string): Promise<number> {
  const keep = liveScriptConfig().keepPerOwner
  const finished = (await listOwnedShows(ownerId, Number.MAX_SAFE_INTEGER))
    .filter((d) => d.status !== 'running')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const old = finished.slice(keep)
  for (const doc of old) await deleteShowFile(doc.id)
  return old.length
}

/** Shows run in this process, so a running show at boot was cut off. */
export async function recoverLiveShows(): Promise<void> {
  for (const doc of await allShows()) {
    if (doc.status === 'running') await updateShow(doc.id, closeOut)
  }
}
