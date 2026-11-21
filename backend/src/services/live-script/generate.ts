import {
  type WebFinding,
  webRead,
  webSearch,
} from '@/services/hook-machine/collectors/agent-reach.js'
import {
  competitorBrandsFrom,
  type HookCandidate,
  type HookContext,
  pickBestHook,
} from '@/services/hook-machine/hook-checks.js'
import {
  cleanDisplayDeep,
  cleanDisplayText,
  type Principle,
} from '@/services/hook-machine/rubric.js'
import {
  type HookSet,
  hookSetSchema,
  productBriefSchema,
  researchDigestSchema,
} from '@/services/hook-machine/schemas.js'
import { ratePerSecond } from '@/services/hook-machine/script-budget.js'
import { digestInstructions, hookInstructions } from '@/services/hook-machine/script-prompts.js'
import type { Profile } from '@/services/hook-machine/types.js'
import { aiIsMocked, ask } from '@/services/live-script/ai.js'
import { engagementCount, rehookCount } from '@/services/live-script/checks.js'
import {
  finalizeHooks,
  finalizeShow,
  segmentLengthWarning,
} from '@/services/live-script/finalize.js'
import { allowedFor, groundDigest } from '@/services/live-script/grounding.js'
import { liveRubricPrompt, SPOKEN_RULES } from '@/services/live-script/rubric.js'
import { liveShowSchema } from '@/services/live-script/schemas.js'
import { logger } from '@/services/logger.service.js'
import { updateShow } from '@/services/live-script/store.js'
import {
  type Playbook,
  type RunOfShow,
  SHOW_STEPS,
  type ShowStep,
} from '@/services/live-script/types.js'
import {
  collectCandidates,
  dropFlagged,
  verifyClaims,
} from '@/services/live-script/verify.js'

const LANGUAGE_NAME = { th: 'Thai', en: 'English' } as const

/** The playbook is sized for a typical stretch of live selling. It is not a timeline. */
const PLAYBOOK_MINUTES = 30

/** The parts of a Hook Machine profile the live pipeline uses, copied once. */
export type StyleContext = {
  name: string
  styleSummary: string
  voice: NonNullable<Profile['insights']>['voice']
  hookFormats: {
    label: string
    original: string
    formula: string
    whyItWorks: string
  }[]
  structureTemplate: NonNullable<Profile['insights']>['structureTemplate']
  ctaPatterns: string[]
  principles: Principle[]
}

export function styleContext(profile: Profile): StyleContext | null {
  const insights = profile.insights
  if (!insights) return null
  return {
    name: profile.name,
    styleSummary: insights.styleSummary,
    voice: insights.voice,
    hookFormats: insights.hookFormats.map(
      ({ label, original, formula, whyItWorks }) => ({
        label,
        original,
        formula,
        whyItWorks,
      }),
    ),
    structureTemplate: insights.structureTemplate,
    ctaPatterns: insights.ctaPatterns,
    principles: profile.rubric.filter((p) => p.source === 'profile'),
  }
}

/** Raised between steps when the watchdog or a delete asked the run to stop. */
export class Cancelled extends Error {}
export type RunState = { cancelled: boolean }

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

async function gather(productUrl: string | null, queries: string[]) {
  const findings: WebFinding[] = []
  const warnings: string[] = []
  if (productUrl) {
    try {
      const page = await webRead(productUrl)
      if (page) findings.push(page)
    } catch (error) {
      warnings.push('อ่านหน้าสินค้าไม่ได้ ใช้ข้อมูลจากโน้ตและรูปแทน')
    }
  }
  for (const query of queries.slice(0, 3)) {
    try {
      findings.push(...(await webSearch(query, 4)))
    } catch (error) {
      warnings.push('ค้นข้อมูลบนเว็บไม่สำเร็จบางส่วน')
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

export const GROUNDING_RULES = `Grounding rules:
- State only product features, sizes, materials, compatibility and performance that appear in facts. Never compute a new price, total, saving or time; quote the offer exactly as typed.
- Never name another brand, seller or competing product, even when a web result mentions it.
- Do not use gendered polite particles (ครับ ค่ะ คะ นะครับ นะคะ) unless the style profile does. Keep the seller's gender unknown.`

export const OFFER_RULES = `Offer rules:
- The seller typed the offer (price, promotion, stock, end time). Use those details exactly as typed. If a field is empty, that detail does not exist.
- Never invent a price, discount, gift, stock count, deadline, countdown, other buyers, reviews, results or certifications.
- Urgency lines are allowed only from the stock or end time the seller typed, and must quote them exactly.`

/** Best first, by the Hook Machine rule (grade, specificity, naming the product, contrast, own style). */
export function orderHooks(
  candidates: HookCandidate[],
  context: HookContext,
): HookCandidate[] {
  const rest = [...candidates]
  const ordered: HookCandidate[] = []
  while (rest.length) {
    const { best } = pickBestHook(rest, context)
    if (!best) break
    ordered.push(best)
    rest.splice(rest.indexOf(best), 1)
  }
  return ordered
}

/** What the API calls the playbook: the written pieces without the internal spreading. */
export function toPlaybook(
  hooks: HookSet,
  show: RunOfShow,
  ordered: HookCandidate[],
  sellingPoints: string[],
): Playbook {
  const style = new Set(hooks.formatMatched.map((h) => h.text))
  const byText = new Map(
    [...hooks.formatMatched, ...hooks.original].map((h) => [h.text, h]),
  )
  return {
    openingHooks: ordered
      .map((c) => byText.get(c.text))
      .filter((h): h is NonNullable<typeof h> => Boolean(h))
      .map((h) => ({
        text: h.text,
        grade: h.grade,
        note: h.note,
        source: style.has(h.text) ? ('style' as const) : ('original' as const),
      })),
    newcomerLines: show.rehooks.map(({ text, grade, note }) => ({
      text,
      grade,
      note,
    })),
    pitches: show.segment.variants,
    sellingPoints: sellingPoints.slice(0, 8),
    chatPrompts: show.engagement.map((e) => e.text),
    objections: show.objections,
    transitions: show.transitions,
    closing: show.closing,
    cues: show.cues,
  }
}

type Run = {
  id: string
  images: string[]
  style: StyleContext | null
  state: RunState
}

/**
 * The whole pipeline for one show: content, research, opening hooks, the
 * pitch and everything around it, the schedule, then a second reader that
 * checks every line against what is known. Progress is written after each
 * step so the page can follow it.
 */
export async function runShowPipeline({
  id,
  images,
  style,
  state,
}: Run): Promise<void> {
  const step = async (key: ShowStep) => {
    if (state.cancelled) throw new Cancelled()
    const index = SHOW_STEPS.findIndex((s) => s.key === key)
    await updateShow(id, (d) => {
      d.step = SHOW_STEPS[index]?.label ?? null
      d.stepIndex = index + 1
    })
  }

  const doc = await updateShow(id, (d) => {
    d.status = 'running'
    d.error = null
    d.errorCode = null
    d.mock = aiIsMocked()
  })
  const lang = LANGUAGE_NAME[doc.language]
  const { input } = doc
  const principles = style?.principles ?? []

  /* 1. Content */
  await step('brief')
  const brief = await ask({
    name: 'live_brief',
    schema: productBriefSchema,
    instructions: `Identify the product for a live selling run of show. Write in ${lang}.
visibleFacts: only things visible in the photos or stated in the notes or offer. searchQueries: at most 3 short web search queries that would find specs, real customer reviews and common complaints.`,
    input: JSON.stringify({
      notes: input.notes,
      productUrl: input.productUrl,
      offer: input.offer,
    }),
    images,
  })
  const cleanBrief = cleanDisplayDeep(brief)
  await updateShow(id, (d) => {
    d.brief = cleanBrief
  })

  /* 2. Research */
  await step('research')
  const { findings, warnings: gatherWarnings } = aiIsMocked()
    ? { findings: [], warnings: ['โหมดเดโม ข้ามการค้นเว็บ'] }
    : await gather(input.productUrl, cleanBrief.searchQueries)
  const digest = await ask({
    name: 'live_digest',
    schema: researchDigestSchema,
    instructions: `${digestInstructions(lang)}
objections: real questions viewers ask in the chat about this kind of product (price, how to use, who it suits, durability, what is included).`,
    input: JSON.stringify({
      brief: cleanBrief,
      notes: input.notes,
      offer: input.offer,
      web: findings,
    }),
    images,
  })
  const sellerText = [
    input.notes,
    ...Object.values(input.offer),
    ...cleanBrief.visibleFacts,
  ]
  const grounded = groundDigest(
    cleanDisplayDeep(digest),
    sellerText,
    findings.map((f) => `${f.title} ${f.text}`),
  )
  const research = {
    ...grounded.digest,
    sources: findings.filter((f) => f.url).map((f) => ({ title: f.title, url: f.url })),
    warnings: [...gatherWarnings, ...grounded.warnings],
  }
  await updateShow(id, (d) => {
    d.research = research
  })

  const supportText = [
    ...sellerText,
    ...research.facts.map((f) => f.claim),
    ...research.sellingPoints,
  ].join(' ')
  const otherBrands = competitorBrandsFrom({
    titles: findings.map((f) => f.title),
    productName: cleanBrief.productName,
    notes: input.notes,
    supportText,
  })
  const hookContext: HookContext = {
    languageCode: doc.language,
    productName: cleanBrief.productName,
    supportText,
    otherBrands,
    payoffTerms: research.sellingPoints.slice(0, 6),
  }
  const ctx = {
    language: doc.language,
    liveMinutes: PLAYBOOK_MINUTES,
    offer: input.offer,
    allowed: allowedFor({ input, brief: cleanBrief, research }),
    otherBrands,
    hookContext,
  }

  /* 3. Opening hooks */
  await step('hooks')
  const rawHooks = await ask({
    name: 'live_hooks',
    schema: hookSetSchema,
    maxOutputTokens: 6000,
    instructions: `${hookInstructions({
      languageName: lang,
      rubric: liveRubricPrompt(principles),
    })}

THESE HOOKS OPEN A LIVE STREAM OR A NEW PRODUCT SEGMENT. Viewers arrive from the feed with no context, so every hook must make sense to someone who joined this second.
If the profile has no formats, return an empty formatMatched list.
${OFFER_RULES}
${GROUNDING_RULES}`,
    input: JSON.stringify({
      profile: style,
      product: cleanBrief,
      facts: research.facts,
      sellingPoints: research.sellingPoints,
      painPoints: research.painPoints,
      notes: input.notes,
      offer: input.offer,
    }),
    images,
  })
  const opening = finalizeHooks(cleanDisplayDeep(rawHooks), ctx)
  const ordered = orderHooks(
    [
      ...opening.hooks.formatMatched.map((h) => ({
        text: h.text,
        grade: h.grade,
        source: 'format' as const,
      })),
      ...opening.hooks.original.map((h) => ({
        text: h.text,
        grade: h.grade,
        source: 'original' as const,
      })),
    ],
    hookContext,
  )
  await updateShow(id, (d) => {
    d.hooks = opening.hooks
  })

  /* 4. The pitch and everything around it */
  await step('pitch')
  const rate = ratePerSecond(doc.language)
  const low = Math.round(rate * 60)
  const high = Math.round(rate * 90)
  const unit = doc.language === 'th' ? 'Thai characters (spaces not counted)' : 'words'
  const rawShow = await ask({
    name: 'live_show',
    schema: liveShowSchema,
    maxOutputTokens: 12_000,
    instructions: `You write the speaking parts of a live selling stream for a seller. Write in ${lang}. Follow the profile's voice and structure when one is given.
- rehooks: exactly ${rehookCount(PLAYBOOK_MINUTES)} short lines for people who join mid stream. Each says in one or two sentences what the product is and why it matters, so a newcomer can follow, then invites them to stay and ask in the chat. Do NOT claim what the seller is doing at this moment: no pouring, zooming, comparing, holding up or answering a particular topic, because you cannot know. They will be said every few minutes, so each must use clearly different wording and different angles. None may reuse or closely paraphrase any of the opening hooks given in openingHooks. Do not end every line with the same invitation: vary how you invite people to stay or ask in the chat, and sometimes end on the product instead. Never write as I said, earlier or again. Grade each honestly, return only B+ or better.
- engagement: exactly ${engagementCount(PLAYBOOK_MINUTES)} short prompts that ask the chat a real question about the viewers' own use or choices, not generic like and share requests.
- segment.variants: exactly 3 different wordings of one repeatable product pitch of about ${low} to ${high} ${unit} spoken. Each variant has lines in this order of parts: hook, problem, demo, proof, offer, cta. demo is talking points for showing the product using only the product itself (open it, point at a part, show each colour), never props the seller did not mention. proof uses only facts. offer states only what the seller typed and may be skipped if the offer is empty. Each variant has exactly one cta line, a single clear action.
- objections: 6 to 8 of the questions viewers really ask (use the objections found in the research plus common live questions such as price, how to use, who it suits). answer uses only facts or the offer. ifUnknown is what the seller says when the answer is not known: honest, short, promises to check, never a guess.
- transitions: 4 short lines the seller uses to start the live, move to the next product, take a short break and come back. The first one starts the live.
- closing: 2 short wordings of an ending.
- cues: markers for when to show the price or promotion graphic. where is one of opening, rehook, segment_offer, segment_cta, closing. kind is one of price, promo, gift, flash, product. note says what to show in a few words with no numbers. Only add price when a price was typed, promo or gift when a promotion was typed, flash when stock or an end time was typed.
${OFFER_RULES}
${GROUNDING_RULES}
${liveRubricPrompt(principles)}
${SPOKEN_RULES}`,
    input: JSON.stringify({
      profile: style,
      product: cleanBrief,
      facts: research.facts,
      sellingPoints: research.sellingPoints,
      painPoints: research.painPoints,
      researchObjections: research.objections,
      notes: input.notes,
      offer: input.offer,
      openingHooks: ordered.map((h) => h.text),
    }),
    images,
  })
  const run = finalizeShow(
    cleanDisplayDeep(rawShow),
    ctx,
    ordered.map((h) => h.text),
  )

  let hooks = opening.hooks
  let show = run.show
  const warnings = [...opening.warnings, ...run.warnings]
  const openingList = () =>
    ordered.filter((h) =>
      [...hooks.formatMatched, ...hooks.original].some((x) => x.text === h.text),
    )
  await updateShow(id, (d) => {
    d.show = show
  })

  /* 5. A second reader checks every line */
  await step('verify')
  let verified = true
  try {
    const flagged = await verifyClaims({
      candidates: collectCandidates(hooks, show),
      facts: research.facts.map((f) => f.claim),
      sellerText,
      language: doc.language,
    })
    if (flagged.size) {
      const result = dropFlagged(
        hooks,
        show,
        new Set(flagged.keys()),
        PLAYBOOK_MINUTES,
        doc.language,
      )
      hooks = result.hooks
      show = result.show
      const shorter = segmentLengthWarning(show.segment.variants)
      if (shorter && !warnings.includes(shorter)) warnings.push(shorter)
      if (!show.segment.variants.length) {
        warnings.push('ยังไม่ได้เซกชันขายสินค้าที่ผ่านการตรวจ ลองสร้างใหม่')
      }
      warnings.push(
        `ตัด ${result.dropped} บรรทัดที่อ้างสิ่งที่ไม่มีในข้อมูลที่ให้ เช่น ${cleanDisplayText([...flagged.values()][0] ?? '')}`,
      )
    }
  } catch (error) {
    verified = false
    logger.warn('LIVE_SCRIPT_VERIFY_FAILED', { reason: message(error) })
    warnings.push(
      'ตรวจที่มาของข้อความด้วย AI ไม่สำเร็จ จึงยังไม่ได้ไล่ดูว่ามีการอ้างสิ่งที่ไม่มีในข้อมูล',
    )
  }
  if (state.cancelled) throw new Cancelled()

  const playbook = toPlaybook(hooks, show, openingList(), research.sellingPoints)
  await updateShow(id, (d) => {
    d.hooks = hooks
    d.show = show
    d.playbook = playbook
    d.verified = verified
    d.warnings = warnings.slice(0, 30)
    d.status = 'ready'
    d.step = null
    d.stepIndex = SHOW_STEPS.length
  })
}
