import { aiIsMocked, structured } from '@/services/hook-machine/ai.js'
import {
  type WebFinding,
  webRead,
  webSearch,
} from '@/services/hook-machine/collectors/agent-reach.js'
import {
  checkHook,
  competitorBrandsFrom,
  type HookContext,
  pickBestHook,
  tidyHook,
} from '@/services/hook-machine/hook-checks.js'
import {
  cleanDisplayDeep,
  cleanDisplayText,
  type Grade,
  gradeRank,
  rubricPrompt,
  stripEmDash,
} from '@/services/hook-machine/rubric.js'
import {
  hookReviewSchema,
  hookSetSchema,
  productBriefSchema,
  researchDigestSchema,
  scriptSchema,
} from '@/services/hook-machine/schemas.js'
import {
  type LengthBudget,
  lengthBudget,
} from '@/services/hook-machine/script-budget.js'
import {
  tightenLines,
  tightenToBudget,
} from '@/services/hook-machine/script-fit.js'
import {
  digestInstructions,
  hookInstructions,
  scriptInstructions,
} from '@/services/hook-machine/script-prompts.js'
import { readDoc, updateDoc } from '@/services/hook-machine/store.js'
import type { Profile, Project } from '@/services/hook-machine/types.js'

const LANGUAGE_NAME = { th: 'Thai', en: 'English' } as const
const running = new Set<string>()

export const isProjectRunning = (id: string) => running.has(id)

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

const step = (id: string, text: string) =>
  updateDoc<Project>('projects', id, (p) => {
    p.step = text
  })

async function load(
  id: string,
): Promise<{ project: Project; profile: Profile }> {
  const project = await readDoc<Project>('projects', id)
  if (!project) throw new Error('project not found')
  const profile = await readDoc<Profile>('profiles', project.profileId)
  if (!profile?.insights) throw new Error('profile has no insights yet')
  return { project, profile }
}

/** Looks the product up with Agent-Reach: the page the user gave plus a few searches. */
async function gather(
  productUrl: string | null,
  queries: string[],
): Promise<{ findings: WebFinding[]; warnings: string[] }> {
  const findings: WebFinding[] = []
  const warnings: string[] = []

  if (productUrl) {
    try {
      const page = await webRead(productUrl)
      if (page) findings.push(page)
    } catch (error) {
      warnings.push(`อ่านหน้าสินค้าไม่ได้: ${message(error)}`)
    }
  }
  for (const query of queries.slice(0, 3)) {
    try {
      findings.push(...(await webSearch(query, 4)))
    } catch (error) {
      warnings.push(`ค้น "${query}" ไม่ได้: ${message(error)}`)
    }
  }
  const seen = new Set<string>()
  return {
    findings: findings.filter(
      (f) => !f.url || (!seen.has(f.url) && seen.add(f.url)),
    ),
    warnings,
  }
}

function profileContext(profile: Profile) {
  const insights = profile.insights
  return {
    styleSummary: insights?.styleSummary,
    voice: insights?.voice,
    hookFormats: insights?.hookFormats.map(
      ({ label, original, formula, whyItWorks }) => ({
        label,
        original,
        formula,
        whyItWorks,
      }),
    ),
    structureTemplate: insights?.structureTemplate,
    ctaPatterns: insights?.ctaPatterns,
  }
}

async function writeScript(
  project: Project,
  profile: Profile,
  hook: string,
): Promise<Project['script']> {
  const budget = lengthBudget({
    targetSec: project.input.durationSec,
    language: project.language,
  })
  const script = await structured({
    name: 'script',
    schema: scriptSchema,
    maxOutputTokens: 8000,
    instructions: scriptInstructions({
      languageName: LANGUAGE_NAME[project.language],
      durationSec: project.input.durationSec,
      rubric: rubricPrompt(
        profile.rubric.filter((p) => p.source === 'profile'),
      ),
      budget,
    }),
    input: JSON.stringify({
      chosenHook: hook,
      profile: profileContext(profile),
      product: project.brief,
      research: project.research && {
        facts: project.research.facts,
        sellingPoints: project.research.sellingPoints,
        painPoints: project.research.painPoints,
        objections: project.research.objections,
      },
      userNotes: project.input.notes,
      imageCount: project.input.images.length,
    }),
    images: project.input.images,
  })
  return fitScriptToBudget(script, {
    languageCode: project.language,
    languageName: LANGUAGE_NAME[project.language],
    budget,
    productName: project.brief?.productName ?? null,
  })
}

/**
 * The writer counts badly, so the spoken text is counted here against the
 * budget and tightened (at most twice) when it runs long. Short is accepted.
 */
async function fitScriptToBudget(
  script: NonNullable<Project['script']>,
  args: {
    languageCode: string
    languageName: string
    budget: LengthBudget
    productName: string | null
  },
): Promise<NonNullable<Project['script']>> {
  const lines = script.beats.map((beat) => beat.voiceover)
  const { lines: fitted, passes } = await tightenToBudget({
    lines,
    ...args,
    tighten: tightenLines,
  })
  if (passes === 0 || fitted.length === 0) return script

  // Map the shortened lines back to beats in order. A line that was dropped
  // takes its beat out with it, so the picture of a kept beat stays with its line.
  const kept: typeof script.beats = []
  let cursor = 0
  for (const text of fitted) {
    const found = script.beats.findIndex(
      (beat, i) => i >= cursor && beat.voiceover === text,
    )
    const exact = found >= 0 ? script.beats[found] : undefined
    if (exact) {
      kept.push({ ...exact, voiceover: text })
      cursor = found + 1
    } else {
      const beat = script.beats[Math.min(cursor, script.beats.length - 1)]
      if (beat) kept.push({ ...beat, voiceover: text })
      cursor = Math.min(cursor + 1, script.beats.length)
    }
  }
  return { ...script, beats: kept }
}

type Hooks = NonNullable<Project['hooks']>

/**
 * Backstop for the hook prompt: tidy every hook (one sentence, no filler, no
 * stop at the end), drop the ones that fail a hard check, and pick the best
 * with an explicit rule. When every hook of a list fails, that list keeps its
 * tidied hooks so the user is never left with nothing.
 */
function refineHooks(
  hooks: Hooks,
  context: HookContext,
): { hooks: Hooks; chosen: { text: string; grade: Grade } | null } {
  const byGrade = <T extends { grade: Grade }>(a: T, b: T) =>
    gradeRank(a.grade) - gradeRank(b.grade)
  const prepare = <T extends { text: string; grade: Grade }>(
    list: T[],
  ): T[] => {
    const tidy = list.map((h) => ({
      ...h,
      text: tidyHook(cleanDisplayText(stripEmDash(h.text))),
    }))
    const passing = tidy.filter((h) => !checkHook(h.text, context).hard)
    return (passing.length > 0 ? passing : tidy)
      .filter((h) => h.text.length > 0)
      .sort(byGrade)
  }

  // Format-matched hooks below C did not really pass the fit screen.
  const formatMatched = prepare(
    hooks.formatMatched.filter((h) => gradeRank(h.grade) <= gradeRank('C')),
  )
  // Original hooks are promised to be B+ or better.
  const original = prepare(
    hooks.original.filter((h) => gradeRank(h.grade) <= gradeRank('B+')),
  )
  const picked = pickBestHook(
    [
      ...formatMatched.map((h) => ({ ...h, source: 'format' as const })),
      ...original.map((h) => ({ ...h, source: 'original' as const })),
    ],
    context,
  )
  return {
    hooks: {
      formatMatched,
      skippedFormats: hooks.skippedFormats.map((s) => cleanDisplayDeep(s)),
      original,
    },
    chosen: picked.best
      ? { text: picked.best.text, grade: picked.best.grade }
      : null,
  }
}

export type ProjectPhase = 'brief' | 'research' | 'hooks' | 'script'

/**
 * Runs the whole script pipeline for one project. `onPhase` is told when each
 * phase starts, so a caller (the one button video job) can follow along
 * without parsing the Thai step text.
 */
export async function runProject(
  projectId: string,
  onPhase?: (phase: ProjectPhase) => void,
): Promise<void> {
  if (running.has(projectId)) return
  running.add(projectId)

  try {
    const { project, profile } = await load(projectId)
    await updateDoc<Project>('projects', projectId, (p) => {
      p.status = 'running'
      p.error = null
      p.mock = aiIsMocked()
    })

    const lang = LANGUAGE_NAME[project.language]

    onPhase?.('brief')
    await step(projectId, 'ดูรูปสินค้าและโน้ต')
    const brief = await structured({
      name: 'product_brief',
      schema: productBriefSchema,
      instructions: `Identify the product and what is needed to research it. Write in ${lang}.
visibleFacts: only things that are actually visible in the photos or stated in the notes. searchQueries: at most 3 short web search queries that would find specs, reviews and real customer complaints.`,
      input: JSON.stringify({
        notes: project.input.notes,
        productUrl: project.input.productUrl,
      }),
      images: project.input.images,
    })
    await updateDoc<Project>('projects', projectId, (p) => {
      // The raw brief keeps its search quotes; what is stored is for people to read.
      p.brief = cleanDisplayDeep(brief)
    })

    onPhase?.('research')
    await step(projectId, 'ค้นข้อมูลสินค้าด้วย Agent-Reach')
    const { findings, warnings } = aiIsMocked()
      ? { findings: [], warnings: ['โหมดเดโม ข้ามการค้นเว็บ'] }
      : await gather(project.input.productUrl, brief.searchQueries)

    await step(projectId, 'สรุปข้อเท็จจริงและจุดขาย')
    const digest = await structured({
      name: 'research_digest',
      schema: researchDigestSchema,
      instructions: digestInstructions(lang),
      input: JSON.stringify({
        brief,
        userNotes: project.input.notes,
        web: findings,
      }),
      images: project.input.images,
    })
    await updateDoc<Project>('projects', projectId, (p) => {
      p.research = {
        ...cleanDisplayDeep(digest),
        sources: findings
          .filter((f) => f.url)
          .map((f) => ({ title: f.title, url: f.url })),
        warnings,
      }
    })

    onPhase?.('hooks')
    await step(projectId, 'คิดฮุกจากสไตล์ในโปรไฟล์')
    const rawHooks = await structured({
      name: 'hook_set',
      schema: hookSetSchema,
      maxOutputTokens: 9000,
      instructions: hookInstructions({
        languageName: lang,
        rubric: rubricPrompt(
          profile.rubric.filter((p) => p.source === 'profile'),
        ),
      }),
      input: JSON.stringify({
        profile: profileContext(profile),
        product: brief,
        research: digest,
        userNotes: project.input.notes,
      }),
      images: project.input.images,
    })
    const supportText = [
      project.input.notes,
      brief.productName,
      ...brief.visibleFacts,
      ...digest.facts.map((f) => f.claim),
      ...digest.sellingPoints,
    ].join(' ')
    const { hooks, chosen } = refineHooks(rawHooks, {
      languageCode: project.language,
      productName: brief.productName,
      supportText,
      otherBrands: competitorBrandsFrom({
        titles: findings.map((f) => f.title),
        productName: brief.productName,
        notes: project.input.notes,
        supportText,
      }),
      payoffTerms: digest.sellingPoints,
    })
    if (!chosen) throw new Error('ไม่ได้ฮุกที่ผ่านเกณฑ์ ลองเพิ่มรายละเอียดสินค้าแล้วสร้างใหม่')
    await updateDoc<Project>('projects', projectId, (p) => {
      p.hooks = hooks
      p.chosenHook = chosen.text
    })

    onPhase?.('script')
    await step(projectId, 'เขียนสคริปต์ตั้งแต่เปิดจนจบคลิป')
    const current = (await readDoc<Project>('projects', projectId)) ?? project
    const script = await writeScript(current, profile, chosen.text)
    await updateDoc<Project>('projects', projectId, (p) => {
      p.script = script
      p.status = 'ready'
      p.step = null
    })
  } catch (error) {
    await updateDoc<Project>('projects', projectId, (p) => {
      p.status = 'error'
      p.step = null
      p.error = message(error)
    }).catch(() => undefined)
  } finally {
    running.delete(projectId)
  }
}

/** Rewrites only the script around a hook the user picked. */
export async function rewriteScript(
  projectId: string,
  hook: string,
): Promise<void> {
  if (running.has(projectId)) return
  running.add(projectId)
  try {
    const { project, profile } = await load(projectId)
    await updateDoc<Project>('projects', projectId, (p) => {
      p.status = 'running'
      p.step = 'เขียนสคริปต์ใหม่รอบฮุกที่เลือก'
      p.error = null
      p.chosenHook = stripEmDash(hook)
    })
    const script = await writeScript(project, profile, stripEmDash(hook))
    await updateDoc<Project>('projects', projectId, (p) => {
      p.script = script
      p.status = 'ready'
      p.step = null
    })
  } catch (error) {
    await updateDoc<Project>('projects', projectId, (p) => {
      p.status = 'error'
      p.step = null
      p.error = message(error)
    }).catch(() => undefined)
  } finally {
    running.delete(projectId)
  }
}

/** Grade mode: score the user's own hook, then give three different rewrites. */
export async function reviewHook(
  projectId: string,
  hook: string,
): Promise<Project> {
  const { project, profile } = await load(projectId)
  const result = await structured({
    name: 'hook_review',
    schema: hookReviewSchema,
    instructions: `Grade the user's own hook honestly. Do not inflate. Write in ${LANGUAGE_NAME[project.language]}.
Go line by line against the rubric and say what works and what does not. If the hook contains an em-dash, flag that it reads as AI-written.
Then write exactly 3 rewrites, each taking a different approach (for example fix the structure, reframe the value promise, add specificity or proof) and say why each is stronger. No em-dashes in rewrites. Use only facts from the product research.
${rubricPrompt(profile.rubric.filter((p) => p.source === 'profile'))}`,
    input: JSON.stringify({
      userHook: hook,
      product: project.brief,
      facts: project.research?.facts,
      profile: profileContext(profile),
    }),
  })
  result.rewrites = result.rewrites.map((r) => ({
    ...r,
    text: stripEmDash(r.text),
  }))
  return updateDoc<Project>('projects', projectId, (p) => {
    p.review = { input: hook, result }
  })
}
