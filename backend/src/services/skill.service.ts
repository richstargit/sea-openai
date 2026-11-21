import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'
import { z } from 'zod'

const MAX_FILE_BYTES = 24_000
const MAX_REFERENCES = 50
const FRONTMATTER = /^---\r?\n([\s\S]+?)\r?\n---(?:\r?\n|$)/
const REFERENCE_EXTENSIONS = new Set([
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.csv',
])

export const skillName = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

const metadataSchema = z.object({
  name: skillName,
  description: z.string().trim().min(1).max(1024),
  'disable-model-invocation': z.boolean().default(false),
  'user-invocable': z.boolean().default(true),
})

export type Skill = {
  name: string
  description: string
  modelInvocable: boolean
  userInvocable: boolean
  directory: string
  instructions: string
}

function missingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

async function readText(path: string): Promise<string | null> {
  try {
    const info = await lstat(path)
    if (!info.isFile() || info.size > MAX_FILE_BYTES) return null
    const bytes = await readFile(path)
    return bytes.length <= MAX_FILE_BYTES ? bytes.toString('utf8') : null
  } catch (error) {
    if (missingFile(error)) return null
    throw error
  }
}

async function loadSkill(root: string, name: string): Promise<Skill | null> {
  const directory = join(root, name)
  const text = await readText(join(directory, 'SKILL.md'))
  const header = text?.match(FRONTMATTER)
  if (!text || !header?.[1]) return null

  const document = parseDocument(header[1])
  if (document.errors.length > 0) return null
  let data: unknown
  try {
    data = document.toJS({ maxAliasCount: 0 })
  } catch {
    return null
  }
  const metadata = metadataSchema.safeParse(data)
  const instructions = text.slice(header[0].length).trim()
  if (!metadata.success || metadata.data.name !== name || !instructions) {
    return null
  }

  return {
    name,
    directory,
    instructions,
    description: metadata.data.description,
    modelInvocable: !metadata.data['disable-model-invocation'],
    userInvocable: metadata.data['user-invocable'],
  }
}

export async function listSkills(): Promise<Skill[]> {
  try {
    const root = await realpath(
      resolve(process.env.AGENT_SKILLS_DIR?.trim() || 'skills'),
    )
    const entries = await readdir(root, { withFileTypes: true })
    const names = entries
      .filter(
        (entry) =>
          entry.isDirectory() && skillName.safeParse(entry.name).success,
      )
      .map((entry) => entry.name)
      .sort()
    const skills = await Promise.all(names.map((name) => loadSkill(root, name)))
    return skills.filter((skill) => skill !== null)
  } catch (error) {
    if (missingFile(error)) return []
    throw error
  }
}

function isReference(path: string): boolean {
  return (
    REFERENCE_EXTENSIONS.has(extname(path).toLowerCase()) &&
    path.split('/').every((part) => part && !part.startsWith('.')) &&
    !path.includes('\\') &&
    !path.includes('\0')
  )
}

async function referenceRoot(skill: Skill): Promise<string | null> {
  const root = join(skill.directory, 'references')
  try {
    return (await lstat(root)).isDirectory() ? root : null
  } catch (error) {
    if (missingFile(error)) return null
    throw error
  }
}

export async function listReferences(skill: Skill): Promise<string[]> {
  const root = await referenceRoot(skill)
  if (!root) return []
  try {
    const entries = await readdir(root, {
      withFileTypes: true,
      recursive: true,
    })
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) =>
        relative(skill.directory, join(entry.parentPath, entry.name))
          .split(sep)
          .join('/'),
      )
      .filter(isReference)
      .sort()
      .slice(0, MAX_REFERENCES)
  } catch (error) {
    if (missingFile(error)) return []
    throw error
  }
}

export async function readReference(
  skill: Skill,
  path: string,
): Promise<string | null> {
  if (!path.startsWith('references/') || !isReference(path)) return null

  const root = await referenceRoot(skill)
  if (!root) return null

  const file = resolve(skill.directory, path)
  try {
    if (!file.startsWith(root + sep) || (await realpath(file)) !== file)
      return null
    return readText(file)
  } catch (error) {
    if (missingFile(error)) return null
    throw error
  }
}

export function describeSkill({
  name,
  description,
  modelInvocable,
  userInvocable,
}: Skill) {
  return { name, description, modelInvocable, userInvocable }
}
