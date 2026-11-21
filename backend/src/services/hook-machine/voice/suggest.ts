import { DEFAULT_STYLE_IDS } from '@/services/hook-machine/voice/catalog.js'

type VoiceProfile = {
  tone: string
  persona: string
  sentenceStyle: string
  vocabulary?: string[]
}

// Plain keyword cues in Thai and English. This is a hint for the default
// selection only, and the user can change every checkbox.
const CUES: Record<string, string[]> = {
  creator: [
    'สดใส',
    'พลัง',
    'สนุก',
    'เร็ว',
    'กระตือรือร้น',
    'ครีเอเตอร์',
    'energetic',
    'upbeat',
    'lively',
    'playful',
    'fast',
    'punchy',
    'cheeky',
  ],
  reviewer: [
    'น่าเชื่อถือ',
    'นิ่ง',
    'จริงใจ',
    'ตรงไปตรงมา',
    'เพื่อน',
    'รีวิว',
    'calm',
    'trust',
    'honest',
    'sincere',
    'measured',
    'friend',
    'review',
  ],
  hype: [
    'เร่งเร้า',
    'ตื่นเต้น',
    'เร้าใจ',
    'ไฮป์',
    'กดดัน',
    'hype',
    'urgent',
    'intense',
    'loud',
    'excited',
  ],
  whisper: [
    'กระซิบ',
    'นุ่ม',
    'เบา',
    'ผ่อนคลาย',
    'whisper',
    'soft',
    'gentle',
    'soothing',
    'asmr',
    'intimate',
  ],
  anchor: [
    'เป็นทางการ',
    'เป็นกลาง',
    'ข่าว',
    'มืออาชีพ',
    'formal',
    'neutral',
    'professional',
    'authoritative',
    'news',
  ],
  storyteller: [
    'เล่าเรื่อง',
    'เรื่องเล่า',
    'อบอุ่น',
    'เป็นกันเอง',
    'story',
    'narrative',
    'warm',
    'conversational',
    'casual',
  ],
}

/**
 * Picks the delivery styles that sound closest to how the style profile
 * speaks. Returns null when nothing matches, so the caller keeps the plain
 * defaults instead of guessing.
 */
export function suggestStyles(
  voice: VoiceProfile | null | undefined,
  limit = 4,
): { styles: string[] } | null {
  if (!voice) return null
  const text =
    `${voice.tone} ${voice.persona} ${voice.sentenceStyle} ${(voice.vocabulary ?? []).join(' ')}`.toLowerCase()

  const scored = Object.entries(CUES)
    .map(([id, cues]) => ({
      id,
      hits: cues.filter((cue) => text.includes(cue)).length,
    }))
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
  if (scored.length === 0) return null

  const styles = scored.slice(0, 3).map((entry) => entry.id)
  // Keep a spread to compare: top matches first, then the usual defaults.
  for (const id of DEFAULT_STYLE_IDS) {
    if (styles.length >= limit) break
    if (!styles.includes(id)) styles.push(id)
  }
  return { styles }
}
