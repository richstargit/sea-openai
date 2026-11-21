import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { aiIsMocked, structured } from '@/services/hook-machine/ai.js'
import { voiceTranslationSchema } from '@/services/hook-machine/schemas.js'
import type { LengthBudget } from '@/services/hook-machine/script-budget.js'
import { translationBudgetPrompt } from '@/services/hook-machine/script-fit.js'
import { readDoc, updateDoc } from '@/services/hook-machine/store.js'
import type {
  Project,
  VoiceState,
  VoiceTake,
} from '@/services/hook-machine/types.js'
import {
  buildInstructions,
  languageInfo,
  modelInfo,
  stylePreset,
} from '@/services/hook-machine/voice/catalog.js'
import { speechProvider } from '@/services/hook-machine/voice/provider.js'
import { scoreTake } from '@/services/hook-machine/voice/score-take.js'

export const MAX_INPUT_CHARS = 4096
const CONCURRENCY = 3
const UUID = /^[0-9a-f-]{36}$/

const running = new Set<string>()
export const isVoiceRunning = (projectId: string) => running.has(projectId)

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** The only place an audio path is built, and only from validated ids. */
export function takeAudioPath(
  projectId: string,
  takeId: string,
): string | null {
  if (!UUID.test(projectId) || !UUID.test(takeId)) return null
  return path.join(
    hookMachineConfig.dataDir,
    'audio',
    projectId,
    `${takeId}.wav`,
  )
}

export function scriptLines(project: Project): string[] {
  return (project.script?.beats ?? [])
    .map((beat) => beat.voiceover.trim())
    .filter(Boolean)
}

export type VoiceSettings = VoiceState['settings']

const patchVoice = (projectId: string, change: (voice: VoiceState) => void) =>
  updateDoc<Project>('projects', projectId, (project) => {
    if (project.voice) change(project.voice)
  })

const patchTake = (
  projectId: string,
  takeId: string,
  change: (take: VoiceTake) => void,
) =>
  patchVoice(projectId, (voice) => {
    const take = voice.takes.find((t) => t.id === takeId)
    if (take) change(take)
  })

/** Quotes and dashes read badly aloud and break the transcript comparison. */
export function cleanSpoken(line: string): string {
  return line
    .replace(/["\u201c\u201d]/g, '')
    .replace(/[\u2010-\u2015-]+/g, ' ')
    .replace(/\u2019/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export async function spokenLines(
  project: Project,
  language: string,
  /** When given, the translation must fit this budget (translate to fit, not word for word). */
  budget?: LengthBudget,
): Promise<{ lines: string[]; fresh: boolean }> {
  const source = scriptLines(project)
  if (language === project.language) return { lines: source, fresh: false }

  const cached = project.voice?.translations[language]
  if (cached) return { lines: cached, fresh: false }

  const target = languageInfo(language)?.name ?? language
  const { lines } = await structured({
    name: 'voice_translation',
    schema: voiceTranslationSchema,
    maxOutputTokens: 3000,
    instructions: `Translate a short video voiceover into ${target} so it can be read aloud.
Return exactly one translated line for each input line, in the same order.
Keep Latin brand and product names unchanged. Write numbers and prices the way they are spoken in words in ${target}.
Sound like natural speech from a person, not a translation. No quotation marks, no dashes, no emoji.${
      budget
        ? `\n${translationBudgetPrompt({
            sourceLines: source,
            sourceCode: project.language,
            budget,
            languageName: target,
          })}`
        : ''
    }`,
    input: JSON.stringify({
      lines: source,
      productName: project.brief?.productName ?? null,
    }),
  })
  return { lines: lines.map(cleanSpoken).filter(Boolean), fresh: true }
}

async function runTake(
  project: Project,
  voice: VoiceState,
  take: VoiceTake,
  index: number,
  input: string,
): Promise<void> {
  const projectId = project.id
  const language = languageInfo(voice.settings.language)
  const preset = stylePreset(take.styleId)
  const model = modelInfo(voice.settings.model)
  if (!language || !preset || !model)
    throw new Error('settings changed while running')

  try {
    await patchTake(projectId, take.id, (t) => {
      t.status = 'running'
    })

    const instructions = buildInstructions(
      preset,
      language,
      project.brief?.productName ?? null,
    )
    const wav = await speechProvider().synthesize({
      model: model.id,
      voice: voice.settings.voice,
      input,
      // Models without instructions can only change speed, so styles map to speed there.
      ...(model.supportsInstructions
        ? { instructions }
        : { speed: preset.speed }),
    })

    const file = takeAudioPath(projectId, take.id)
    if (!file) throw new Error('bad id')
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, wav)

    const { scores, transcript, durationSec } = await scoreTake({
      wav,
      spokenText: input,
      language,
      targetSec: project.input.durationSec,
      productName: project.brief?.productName ?? null,
      styleBrief: model.supportsInstructions
        ? instructions
        : `${preset.label}, speed ${preset.speed}`,
      index,
    })

    await patchTake(projectId, take.id, (t) => {
      t.status = 'done'
      t.durationSec = Math.round(durationSec * 10) / 10
      t.transcript = transcript
      t.scores = scores
    })
  } catch (error) {
    await patchTake(projectId, take.id, (t) => {
      t.status = 'error'
      t.error = message(error)
    })
  }
}

/**
 * Creates the voice state right away, so the next poll already shows the
 * takes, then does the slow work in the background.
 */
export async function startVoice(
  projectId: string,
  settings: VoiceSettings,
): Promise<VoiceState> {
  if (running.has(projectId)) throw new Error('voice job already running')
  running.add(projectId)

  try {
    // New run replaces the old takes and their audio, but keeps the translation cache.
    await rm(path.join(hookMachineConfig.dataDir, 'audio', projectId), {
      recursive: true,
      force: true,
    })
    const takes: VoiceTake[] = settings.styleIds.map((styleId) => ({
      id: crypto.randomUUID(),
      styleId,
      styleName: stylePreset(styleId)?.label ?? styleId,
      status: 'pending',
      error: null,
      durationSec: null,
      transcript: null,
      scores: null,
      userRating: null,
      recommended: false,
    }))
    const project = await updateDoc<Project>('projects', projectId, (doc) => {
      doc.voice = {
        status: 'running',
        step: 'เตรียมข้อความที่จะอ่าน',
        error: null,
        mock: aiIsMocked(),
        settings,
        spokenText: null,
        translations: doc.voice?.translations ?? {},
        takes,
        createdAt: new Date().toISOString(),
      }
    })
    void execute(projectId, settings).finally(() => running.delete(projectId))
    return project.voice as VoiceState
  } catch (error) {
    running.delete(projectId)
    throw error
  }
}

async function execute(
  projectId: string,
  settings: VoiceSettings,
): Promise<void> {
  try {
    const first = await readDoc<Project>('projects', projectId)
    if (!first?.script) throw new Error('project has no script')

    const { lines, fresh } = await spokenLines(first, settings.language)
    const input = lines.join('\n')
    if (!input) throw new Error('ไม่มีข้อความให้อ่าน')
    if (input.length > MAX_INPUT_CHARS) {
      throw new Error(
        `ข้อความยาวเกิน ${MAX_INPUT_CHARS} ตัวอักษร ลดความยาวสคริปต์ก่อน`,
      )
    }
    await patchVoice(projectId, (voice) => {
      voice.spokenText = input
      voice.step = 'สร้างเสียงและให้คะแนน'
      if (fresh) voice.translations[settings.language] = lines
    })

    const project = (await readDoc<Project>('projects', projectId)) ?? first
    const voice = project.voice as VoiceState
    const queue = voice.takes.map((take, index) => ({ take, index }))
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          await runTake(project, voice, next.take, next.index, input)
        }
      }),
    )

    await patchVoice(projectId, (state) => {
      const done = state.takes.filter((t) => t.status === 'done' && t.scores)
      if (done.length === 0) {
        state.status = 'error'
        state.error =
          state.takes.find((t) => t.error)?.error ?? 'สร้างเสียงไม่สำเร็จ'
      } else {
        state.status = 'ready'
        const best = done.reduce((a, b) =>
          (b.scores?.total ?? 0) > (a.scores?.total ?? 0) ? b : a,
        )
        for (const take of state.takes) take.recommended = take.id === best.id
      }
      state.step = null
    })
  } catch (error) {
    await patchVoice(projectId, (voice) => {
      voice.status = 'error'
      voice.step = null
      voice.error = message(error)
      for (const take of voice.takes) {
        if (take.status === 'pending' || take.status === 'running')
          take.status = 'error'
      }
    }).catch(() => undefined)
  }
}
