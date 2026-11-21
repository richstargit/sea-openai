import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { aiIsMocked, structured } from '@/services/hook-machine/ai.js'
import { collectSource } from '@/services/hook-machine/collectors/collect.js'
import {
  cleanDisplayDeep,
  type Principle,
  rubricPrompt,
  stripEmDash,
  UNIVERSAL_PRINCIPLES,
} from '@/services/hook-machine/rubric.js'
import {
  profileInsightsSchema,
  videoAnalysisSchema,
} from '@/services/hook-machine/schemas.js'
import { readDoc, updateDoc } from '@/services/hook-machine/store.js'
import type { Profile, Source } from '@/services/hook-machine/types.js'

const LANGUAGE_NAME = { th: 'Thai', en: 'English' } as const

const running = new Set<string>()

export function isRunning(profileId: string): boolean {
  return running.has(profileId)
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const patchSource = (
  profileId: string,
  sourceId: string,
  patch: Partial<Source>,
) =>
  updateDoc<Profile>('profiles', profileId, (profile) => {
    const source = profile.sources.find((s) => s.id === sourceId)
    if (source) Object.assign(source, patch)
  })

async function analyzeSource(profile: Profile, source: Source): Promise<void> {
  const report = async (step: string) => {
    await patchSource(profile.id, source.id, { status: 'running', step })
  }

  try {
    const collected = await collectSource(source.url, source.platform, report)

    await report('วิเคราะห์ฮุกและโครงสร้างคลิป')
    const { meta } = collected
    const analysis = await structured({
      name: 'video_analysis',
      schema: videoAnalysisSchema,
      instructions: `You study one short-form video to learn how its creator hooks and structures a clip.
Write all free text in ${LANGUAGE_NAME[profile.language]}, except hookText, which must be copied verbatim from the transcript in its original language.
- hookText: the spoken hook only. It ends where the creator moves from "making you stay" to "delivering the content". Do not include body sentences and do not drop setup lines. If there is no transcript, use the on-screen text or caption you can see and say so in whyItWorks.
- formula: turn hookText into a fill-in-the-blank formula using [bracketed slots].
- visualHook: describe what the first ${hookMachineConfig.hookSeconds} seconds look like from the frames (framing, on-screen text, movement, cuts). If no frames are given, write that no frames were available.
- bodyBeats: the sections after the hook with rough seconds.
Never invent facts that are not in the data you were given.`,
      input: JSON.stringify({
        platform: source.platform,
        title: meta.title,
        author: meta.author,
        views: meta.views,
        likes: meta.likes,
        durationSec: meta.durationSec,
        description: meta.description?.slice(0, 600) ?? null,
        pacing: collected.pacing,
        frameSeconds: collected.frames.map((f) => f.second),
        transcript: collected.transcript || null,
      }),
      images: collected.frames.map((f) => f.dataUrl),
    })

    analysis.hookText = analysis.hookText.trim()
    await patchSource(profile.id, source.id, {
      status: 'done',
      step: null,
      error: null,
      via: collected.via,
      warnings: collected.warnings,
      video: {
        title: meta.title,
        author: meta.author,
        publishedAt: meta.publishedAt,
        durationSec: meta.durationSec,
        views: meta.views,
        likes: meta.likes,
      },
      transcript: collected.transcript || null,
      transcriptSource: collected.transcriptSource,
      pacing: collected.pacing,
      analysis,
    })
  } catch (error) {
    await patchSource(profile.id, source.id, {
      status: 'error',
      step: null,
      error: message(error),
    })
  }
}

async function synthesize(profileId: string): Promise<void> {
  const profile = await readDoc<Profile>('profiles', profileId)
  if (!profile) return
  const done = profile.sources.filter((s) => s.status === 'done' && s.analysis)
  if (done.length === 0) {
    throw new Error(
      'ไม่มีคลิปไหนวิเคราะห์สำเร็จ ลองใส่ลิงก์อื่นหรือดูข้อความผิดพลาดของแต่ละคลิป',
    )
  }

  const insights = await structured({
    name: 'profile_insights',
    schema: profileInsightsSchema,
    maxOutputTokens: 12_000,
    instructions: `You build a creator style profile from the analyses of videos a user admires.
Write all free text in ${LANGUAGE_NAME[profile.language]}. Keep hook "original" text verbatim.
The videos are references the user likes, not a ranked set of winners and losers, so look for what they have in common and where they differ.
- hookFormats: one entry per reference hook worth reusing. sourceIndex is the 1-based position of the video in the input list. Fill formula with [bracketed slots].
- patterns: compare across the videos on psychology (contrast, curiosity loops, credibility, urgency, self-identification), trigger words and framing (numbers, named frameworks, time limits), grammatical structure (statement or question, sentence length, where the key information lands), and pacing/visual. Give evidence from the data for each. Only report patterns that appear in at least two videos, or flag a single-video pattern as such in its description.
- customPrinciples: grading principles specific to this profile that are materially different from the universal ones below and supported by evidence. Do not pad with overlaps.
- structureTemplate: the typical beat order and seconds.
Universal principles already in the rubric (do not repeat them as custom):
${UNIVERSAL_PRINCIPLES.map((p) => `- ${p.name}`).join('\n')}`,
    input: JSON.stringify(
      done.map((s, i) => ({
        index: i + 1,
        platform: s.platform,
        title: s.video?.title,
        author: s.video?.author,
        views: s.video?.views,
        pacing: s.pacing,
        analysis: s.analysis,
      })),
    ),
  })

  const custom: Principle[] = insights.customPrinciples.map((p) => ({
    name: p.name,
    description: p.description,
    evidence: p.evidence,
    source: 'profile',
  }))

  await updateDoc<Profile>('profiles', profileId, (doc) => {
    const clean = cleanDisplayDeep(insights)
    doc.insights = {
      ...clean,
      hookFormats: insights.hookFormats.map((format, i) => ({
        ...(clean.hookFormats[i] ?? format),
        // The original hook stays word for word, apart from dashes.
        original: stripEmDash(format.original),
        sourceId: done[format.sourceIndex - 1]?.id ?? null,
      })),
    }
    doc.rubric = [...UNIVERSAL_PRINCIPLES, ...custom]
  })
}

/** Runs every pending or failed source, then builds the profile. */
export async function runProfileAnalysis(profileId: string): Promise<void> {
  if (running.has(profileId)) return
  running.add(profileId)

  try {
    await updateDoc<Profile>('profiles', profileId, (profile) => {
      profile.status = 'running'
      profile.error = null
      profile.step = 'วิเคราะห์คลิปอ้างอิง'
      profile.mock = aiIsMocked()
      for (const source of profile.sources) {
        if (source.status !== 'done') {
          source.status = 'pending'
          source.error = null
        }
      }
    })

    const profile = await readDoc<Profile>('profiles', profileId)
    if (!profile) return
    const queue = profile.sources.filter((s) => s.status === 'pending')

    const workers = Array.from(
      { length: Math.min(hookMachineConfig.sourceConcurrency, queue.length) },
      async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          await analyzeSource(profile, next)
        }
      },
    )
    await Promise.all(workers)

    await updateDoc<Profile>('profiles', profileId, (doc) => {
      doc.step = 'สรุปสไตล์และสร้างเกณฑ์ให้คะแนน'
    })
    await synthesize(profileId)
    await updateDoc<Profile>('profiles', profileId, (doc) => {
      doc.status = 'ready'
      doc.step = null
    })
  } catch (error) {
    await updateDoc<Profile>('profiles', profileId, (doc) => {
      doc.status = 'error'
      doc.step = null
      doc.error = message(error)
    }).catch(() => undefined)
  } finally {
    running.delete(profileId)
  }
}

export { rubricPrompt }
