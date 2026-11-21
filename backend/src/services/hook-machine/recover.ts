import { listDocs, updateDoc } from '@/services/hook-machine/store.js'
import type { Profile, Project } from '@/services/hook-machine/types.js'
import { recoverVideoJobs } from '@/services/video-job/job.js'

/** Jobs run in this process, so anything still "running" at boot was cut off. */
export async function recoverInterruptedJobs(): Promise<void> {
  const note = 'เซิร์ฟเวอร์ถูกรีสตาร์ทระหว่างทำงาน กดรันอีกครั้ง'

  for (const profile of await listDocs<Profile>('profiles')) {
    if (profile.status !== 'running') continue
    await updateDoc<Profile>('profiles', profile.id, (doc) => {
      doc.status = 'error'
      doc.step = null
      doc.error = note
      for (const source of doc.sources) {
        if (source.status === 'running') source.status = 'pending'
      }
    })
  }
  for (const project of await listDocs<Project>('projects')) {
    const voiceCut = project.voice?.status === 'running'
    if (project.status !== 'running' && !voiceCut) continue
    await updateDoc<Project>('projects', project.id, (doc) => {
      if (doc.status === 'running') {
        doc.status = 'error'
        doc.step = null
        doc.error = note
      }
      if (doc.voice?.status === 'running') {
        doc.voice.status = 'error'
        doc.voice.step = null
        doc.voice.error = note
        for (const take of doc.voice.takes) {
          if (take.status === 'pending' || take.status === 'running')
            take.status = 'error'
        }
      }
    })
  }
  await recoverVideoJobs()
}
