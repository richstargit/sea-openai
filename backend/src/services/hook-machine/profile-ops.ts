import { rm } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { isRunning as profileRunning } from '@/services/hook-machine/analyze.js'
import { isProjectRunning } from '@/services/hook-machine/project.js'
import { deleteDoc, listDocs } from '@/services/hook-machine/store.js'
import type { Profile, Project } from '@/services/hook-machine/types.js'
import { isVoiceRunning } from '@/services/hook-machine/voice/job.js'

const UUID = /^[0-9a-f-]{36}$/

const projectBusy = (p: Project) =>
  p.status === 'running' ||
  p.voice?.status === 'running' ||
  isProjectRunning(p.id) ||
  isVoiceRunning(p.id)

/** The scripts that were written with one style, newest first. */
export async function projectsOfProfile(
  profileId: string,
  ownerId: string,
): Promise<Project[]> {
  return (await listDocs<Project>('projects'))
    .filter((p) => p.profileId === profileId && p.ownerId === ownerId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/**
 * Deletes a style together with the scripts and audio made from it, since a
 * script without its style can no longer be rewritten or graded. Refuses
 * while anything still runs.
 */
export async function deleteProfileWithProjects(
  profile: Profile,
): Promise<{ ok: true; projects: number } | { ok: false }> {
  const projects = await projectsOfProfile(profile.id, profile.ownerId)
  if (
    profile.status === 'running' ||
    profileRunning(profile.id) ||
    projects.some(projectBusy)
  ) {
    return { ok: false }
  }
  for (const project of projects) {
    if (UUID.test(project.id)) {
      await rm(path.join(hookMachineConfig.dataDir, 'audio', project.id), {
        recursive: true,
        force: true,
      })
    }
    await deleteDoc('projects', project.id)
  }
  await deleteDoc('profiles', profile.id)
  return { ok: true, projects: projects.length }
}
