// One place for every model, voice, language and delivery style the voice
// feature offers. Controllers, the job and the options endpoint all read this.

export const SPEECH_MODELS = ['gpt-4o-mini-tts', 'tts-1-hd', 'tts-1'] as const
export type SpeechModel = (typeof SPEECH_MODELS)[number]

export const DEFAULT_MODEL: SpeechModel = 'gpt-4o-mini-tts'
export const DEFAULT_VOICE = 'marin'

const FULL_VOICES = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
] as const

// tts-1 and tts-1-hd only know the older nine.
const CLASSIC_VOICES = [
  'alloy',
  'ash',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
] as const

export const RECOMMENDED_VOICES: readonly string[] = ['marin', 'cedar']

export type ModelInfo = {
  id: SpeechModel
  label: string
  note: string
  supportsInstructions: boolean
  recommended: boolean
  voices: readonly string[]
}

export const MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o-mini-tts',
    label: 'gpt-4o-mini-tts',
    note: 'คุณภาพดีที่สุด สั่งสไตล์การพูดด้วยคำสั่งได้',
    supportsInstructions: true,
    recommended: true,
    voices: FULL_VOICES,
  },
  {
    id: 'tts-1-hd',
    label: 'tts-1-hd',
    note: 'คุณภาพสูง ปรับได้แค่ความเร็ว',
    supportsInstructions: false,
    recommended: false,
    voices: CLASSIC_VOICES,
  },
  {
    id: 'tts-1',
    label: 'tts-1',
    note: 'เร็วที่สุด คุณภาพต่ำกว่า ปรับได้แค่ความเร็ว',
    supportsInstructions: false,
    recommended: false,
    voices: CLASSIC_VOICES,
  },
]

export function modelInfo(id: string): ModelInfo | undefined {
  return MODELS.find((model) => model.id === id)
}

/** Why a model and voice pair is not allowed, or null when it is fine. */
export function comboProblem(model: string, voice: string): string | null {
  const info = modelInfo(model)
  if (!info) return `Unknown speech model "${model}"`
  if (!info.voices.includes(voice)) {
    return `Voice "${voice}" is not available on ${model}`
  }
  return null
}

export const DEPRECATION = {
  shutdownDate: '2027-01-06',
  successor: 'gpt-realtime-2.1-mini',
  message:
    'OpenAI จะปิด speech endpoint และโมเดลเสียงชุดนี้วันที่ 6 มกราคม 2027 ตัวแทนคือ gpt-realtime-2.1-mini ผ่าน Realtime API ซึ่งต้องเปลี่ยนวิธีเชื่อมต่อ',
}

export type LanguageInfo = {
  code: string
  /** English name, used to pin the language in instructions. */
  name: string
  label: string
  /** Unspaced scripts are scored by characters, the rest by words. */
  unit: 'words' | 'chars'
  /** Comfortable speaking rate for a short ad, units per second. */
  band: [number, number]
}

export const LANGUAGES: LanguageInfo[] = [
  {
    code: 'en',
    name: 'English',
    label: 'อังกฤษ',
    unit: 'words',
    band: [2.3, 3.2],
  },
  { code: 'th', name: 'Thai', label: 'ไทย', unit: 'chars', band: [9, 15] },
  { code: 'ja', name: 'Japanese', label: 'ญี่ปุ่น', unit: 'chars', band: [5, 9] },
  {
    code: 'zh',
    name: 'Mandarin Chinese',
    label: 'จีน',
    unit: 'chars',
    band: [3.5, 6.5],
  },
  {
    code: 'es',
    name: 'Spanish',
    label: 'สเปน',
    unit: 'words',
    band: [2.5, 3.6],
  },
  {
    code: 'id',
    name: 'Indonesian',
    label: 'อินโดนีเซีย',
    unit: 'words',
    band: [2.0, 3.2],
  },
  {
    code: 'vi',
    name: 'Vietnamese',
    label: 'เวียดนาม',
    unit: 'words',
    band: [2.5, 4.0],
  },
]

export const DEFAULT_LANGUAGE = 'en'

export function languageInfo(code: string): LanguageInfo | undefined {
  return LANGUAGES.find((language) => language.code === code)
}

export type StylePreset = {
  id: string
  label: string
  summary: string
  /** Labeled instruction lines, sent as gpt-4o-mini-tts `instructions`. */
  lines: { label: string; value: string }[]
  /** Used instead of instructions on models that cannot take them. */
  speed: number
}

export const STYLES: StylePreset[] = [
  {
    id: 'creator',
    label: 'ครีเอเตอร์สายพลัง',
    summary: 'สดใส เร็ว คุยกับกล้องตรงๆ',
    speed: 1.08,
    lines: [
      {
        label: 'Voice Affect',
        value: 'Bright, upbeat, talking straight to camera.',
      },
      {
        label: 'Tone',
        value: 'Enthusiastic, conversational, a little cheeky.',
      },
      {
        label: 'Pacing',
        value:
          'Fast and punchy in short bursts, slight speed up on the first line.',
      },
      { label: 'Emotion', value: 'Excited, like sharing a great find.' },
      {
        label: 'Emphasis',
        value:
          'Stress the key noun in the hook and the action verb in the closing line.',
      },
    ],
  },
  {
    id: 'reviewer',
    label: 'รีวิวเวอร์น่าเชื่อถือ',
    summary: 'นิ่ง อบอุ่น เหมือนเพื่อนที่รู้จริง',
    speed: 0.96,
    lines: [
      { label: 'Voice Affect', value: 'Warm, composed, credible.' },
      {
        label: 'Tone',
        value: 'Honest and measured, like a friend with real expertise.',
      },
      { label: 'Pacing', value: 'Steady, moderate and even.' },
      { label: 'Emotion', value: 'Quiet confidence.' },
      { label: 'Pauses', value: 'A brief beat before each key benefit.' },
    ],
  },
  {
    id: 'hype',
    label: 'ไฮป์สุดๆ',
    summary: 'เสียงดัง เร่งเร้า หยุดก่อนเฉลย',
    speed: 1.14,
    lines: [
      { label: 'Voice Affect', value: 'Big, high energy announcer.' },
      { label: 'Tone', value: 'Urgent, cannot miss.' },
      {
        label: 'Pacing',
        value: 'Very fast with sudden stops right before the reveal.',
      },
      { label: 'Emotion', value: 'Thrilled and intense.' },
      { label: 'Emphasis', value: 'Stress numbers and the word now.' },
    ],
  },
  {
    id: 'whisper',
    label: 'กระซิบใกล้ไมค์',
    summary: 'เบา ใกล้ นุ่ม ผ่อนคลาย',
    speed: 0.9,
    lines: [
      { label: 'Voice Affect', value: 'Intimate, close to the microphone.' },
      { label: 'Tone', value: 'Soft, secretive and soothing.' },
      { label: 'Pacing', value: 'Slow and smooth.' },
      { label: 'Emotion', value: 'Calm and tender.' },
      {
        label: 'Delivery',
        value: 'Whispered and breathy, never raise the volume.',
      },
    ],
  },
  {
    id: 'anchor',
    label: 'ผู้ประกาศข่าว',
    summary: 'ชัด เป็นกลาง น่าเชื่อถือ',
    speed: 1.0,
    lines: [
      { label: 'Voice Affect', value: 'Clear, neutral and authoritative.' },
      { label: 'Tone', value: 'Professional and informational.' },
      { label: 'Pacing', value: 'Even and deliberate.' },
      { label: 'Emotion', value: 'Controlled.' },
      {
        label: 'Pronunciation',
        value: 'Enunciate numbers and names precisely.',
      },
    ],
  },
  {
    id: 'storyteller',
    label: 'นักเล่าเรื่องเป็นกันเอง',
    summary: 'อบอุ่น มีจังหวะ ช้าลงตอนเฉลย',
    speed: 0.95,
    lines: [
      { label: 'Voice Affect', value: 'Warm, inviting and expressive.' },
      { label: 'Tone', value: 'Playful and narrative.' },
      {
        label: 'Pacing',
        value: 'Varied, slow down at reveals and speed up in action.',
      },
      { label: 'Emotion', value: 'Curious and delighted.' },
      { label: 'Pauses', value: 'Pause after the setup line.' },
    ],
  },
]

export const DEFAULT_STYLE_IDS = ['creator', 'reviewer', 'hype', 'storyteller']
export const MAX_STYLES = 6

export function stylePreset(id: string): StylePreset | undefined {
  return STYLES.find((style) => style.id === id)
}

/**
 * Labeled lines in a fixed order, then the product name and a hard language
 * pin. The style name itself is never part of what gets spoken.
 */
export function buildInstructions(
  style: StylePreset,
  language: LanguageInfo,
  productName: string | null,
): string {
  const lines = style.lines.map(({ label, value }) => `${label}: ${value}`)
  if (productName && !style.lines.some((l) => l.label === 'Pronunciation')) {
    lines.push(
      `Pronunciation: Say the product name ${productName} clearly and the same way every time.`,
    )
  }
  lines.push(`Language: Speak ${language.name} only. Do not switch languages.`)
  lines.push('No sound effects and no background noise.')
  return lines.join('\n')
}
