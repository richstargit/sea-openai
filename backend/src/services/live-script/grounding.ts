import type { ResearchDigest } from '@/services/hook-machine/schemas.js'
import {
  allowedNumbers,
  unsupportedNumbers,
} from '@/services/live-script/checks.js'
import type { LiveShowDoc } from '@/services/live-script/types.js'

/**
 * Numbers a spoken line may contain: the ones the seller typed or a sourced
 * fact states. Anything else is treated as invented.
 */
export function allowedFor(
  show: Pick<LiveShowDoc, 'input' | 'brief' | 'research'>,
): Set<string> {
  const { input, brief, research } = show
  return allowedNumbers([
    input.notes,
    input.offer.price,
    input.offer.promotion,
    input.offer.stock,
    input.offer.endsAt,
    ...(brief?.visibleFacts ?? []),
    ...(research?.facts.map((f) => f.claim) ?? []),
  ])
}

/**
 * The research model sometimes computes a number (a total after a discount, a
 * clock time from a Thai phrase) and files it as a fact. A fact may only carry
 * numbers that appear in what the seller typed, or, for web facts, in the page
 * text it read. Anything else moves to the verify list instead of being said.
 */
export function groundDigest(
  digest: ResearchDigest,
  sellerText: string[],
  webText: string[],
): { digest: ResearchDigest; warnings: string[] } {
  const seller = allowedNumbers(sellerText)
  const web = allowedNumbers(webText)
  const either = new Set([...seller, ...web])
  const moved: string[] = []

  const facts = digest.facts.filter((fact) => {
    const pool = fact.source === 'web' ? web : seller
    if (!unsupportedNumbers(fact.claim, pool).length) return true
    moved.push(fact.claim)
    return false
  })
  const sellingPoints = digest.sellingPoints.filter((point) => {
    if (!unsupportedNumbers(point, either).length) return true
    moved.push(point)
    return false
  })

  return {
    digest: {
      ...digest,
      facts,
      sellingPoints,
      claimsToVerify: [...digest.claimsToVerify, ...moved],
    },
    warnings: moved.length
      ? [`ย้าย ${moved.length} ข้อความที่มีตัวเลขไม่ตรงกับข้อมูลที่ให้ไปไว้ในรายการรอตรวจสอบ`]
      : [],
  }
}
