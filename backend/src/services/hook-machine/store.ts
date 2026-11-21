import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'

type Kind = 'profiles' | 'projects'

const UUID = /^[0-9a-f-]{36}$/

// One queue per file so overlapping updates from parallel jobs never clobber
// each other.
const queues = new Map<string, Promise<unknown>>()

function fileFor(kind: Kind, id: string): string {
  if (!UUID.test(id)) throw new Error('invalid id')
  return path.join(hookMachineConfig.dataDir, kind, `${id}.json`)
}

export async function readDoc<T>(kind: Kind, id: string): Promise<T | null> {
  if (!UUID.test(id)) return null
  try {
    return JSON.parse(await readFile(fileFor(kind, id), 'utf8')) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function listDocs<T>(kind: Kind): Promise<T[]> {
  const dir = path.join(hookMachineConfig.dataDir, kind)
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const docs: T[] = []
  for (const name of names.filter((n) => n.endsWith('.json'))) {
    const doc = await readDoc<T>(kind, name.slice(0, -5))
    if (doc) docs.push(doc)
  }
  return docs
}

/** Read, change and atomically write one document. */
export function updateDoc<T extends { id: string }>(
  kind: Kind,
  id: string,
  change: (doc: T) => void,
): Promise<T> {
  const file = fileFor(kind, id)
  const run = (queues.get(file) ?? Promise.resolve()).then(async () => {
    const doc = await readDoc<T>(kind, id)
    if (!doc) throw new Error(`${kind} ${id} not found`)
    change(doc)
    await writeAtomic(file, doc)
    return doc
  })
  queues.set(
    file,
    run.catch(() => undefined),
  )
  return run
}

export async function createDoc<T extends { id: string }>(
  kind: Kind,
  doc: T,
): Promise<T> {
  await writeAtomic(fileFor(kind, doc.id), doc)
  return doc
}

async function writeAtomic(file: string, doc: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, JSON.stringify(doc, null, 2))
  await rename(tmp, file)
}
