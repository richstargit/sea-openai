import { suggestStyles } from '@/services/hook-machine/voice/suggest.js'

describe('voice style suggestion', () => {
  it('leans on the cues in the style voice and keeps a spread to compare', () => {
    const result = suggestStyles({
      tone: 'calm and honest, like a friend',
      persona: 'trusted reviewer',
      sentenceStyle: 'short',
    })
    expect(result?.styles[0]).toBe('reviewer')
    expect(result?.styles.length).toBe(4)
    expect(new Set(result?.styles).size).toBe(result?.styles.length)
  })

  it('reads Thai cues', () => {
    expect(
      suggestStyles({
        tone: 'กระซิบ นุ่ม ผ่อนคลาย',
        persona: '',
        sentenceStyle: '',
      })?.styles[0],
    ).toBe('whisper')
  })

  it('returns null instead of guessing when nothing matches', () => {
    expect(suggestStyles(null)).toBeNull()
    expect(
      suggestStyles({ tone: 'qwerty', persona: 'zzz', sentenceStyle: '' }),
    ).toBeNull()
  })
})
