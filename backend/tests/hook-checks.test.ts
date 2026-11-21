import {
  checkHook,
  competitorBrandsFrom,
  type HookContext,
  hasMidSentenceStop,
  isFillerSentence,
  pickBestHook,
  splitSentences,
  tidyHook,
} from '@/services/hook-machine/hook-checks.js'
import { lengthBudget } from '@/services/hook-machine/script-budget.js'
import {
  digestInstructions,
  hookInstructions,
  scriptInstructions,
} from '@/services/hook-machine/script-prompts.js'

const thai: HookContext = {
  languageCode: 'th',
  productName: 'Pentel EnerGel-X BLN105',
  supportText:
    'Pentel EnerGel-X BLN105 หัว 0.5 มม. หมึกแห้งไว ด้ามใส เห็นหมึกที่เหลือ ไส้ LRN5',
  payoffTerms: ['หมึกแห้งไว', 'ด้ามใสเห็นหมึกที่เหลือ'],
  otherBrands: ['Maruderm', 'Varnya'],
}

describe('hook filler and sentence rules', () => {
  it('flags the filler the real runs produced', () => {
    expect(isFillerSentence('มาดูรายละเอียดกัน')).toBe(true)
    expect(isFillerSentence('ลองดูรายละเอียดสินค้า')).toBe(true)
    expect(isFillerSentence("let's take a look at the details")).toBe(true)
    expect(isFillerSentence('Watch this')).toBe(true)
    expect(isFillerSentence('ปากกาเจลแห้งไวไม่เลอะมือ')).toBe(false)
  })

  it('finds two sentences with a stop in the middle, and ignores unit abbreviations', () => {
    expect(
      hasMidSentenceStop('เซรั่มขวดนี้ ฉลากสีครีมตัดกับแก้วสีอำพันพอดี. มาดูรายละเอียดกัน'),
    ).toBe(true)
    expect(hasMidSentenceStop('Why pay more? This pen refills')).toBe(true)
    expect(hasMidSentenceStop('ขวดขนาด 30 มล. ฉลากบอกชัดเจน')).toBe(false)
    expect(hasMidSentenceStop('Version 2.5 is out')).toBe(false)
    expect(splitSentences('One. Two. Three')).toEqual(['One.', 'Two.', 'Three'])
  })

  it('tidies a hook to one sentence with no filler and no final stop', () => {
    expect(tidyHook('เซรั่มขวดนี้ ฉลากสีครีมตัดกับแก้วสีอำพันพอดี. มาดูรายละเอียดกัน')).toBe(
      'เซรั่มขวดนี้ ฉลากสีครีมตัดกับแก้วสีอำพันพอดี',
    )
    expect(tidyHook("Let's look at the details. This pen refills!")).toBe(
      'This pen refills',
    )
    expect(tidyHook('Dry in a second...')).toBe('Dry in a second')
    expect(tidyHook('ปากกานี้เปลี่ยนไส้ได้')).toBe('ปากกานี้เปลี่ยนไส้ได้')
  })
})

describe('hook checks', () => {
  it('passes a clean, specific hook', () => {
    const r = checkHook('หมึกแห้งไวจนปาดไม่เลอะ ปากกาเจลด้ามเดียวใช้ได้นาน', thai)
    expect(r.issues).toEqual([])
    expect(r.hard).toBe(false)
  })

  it('fails filler, a stop in the middle, and a hook that is too long', () => {
    expect(checkHook('ปากกาด้ามนี้ มาดูรายละเอียดกัน', thai).issues).toContain(
      'filler',
    )
    expect(checkHook('หมึกแห้งไว. ใช้ดีมาก', thai).issues).toContain('midStop')
    const long =
      'ปากกาเจลหมึกแห้งไวด้ามนี้เปลี่ยนไส้ได้ไม่ต้องซื้อใหม่และเห็นหมึกที่เหลือผ่านด้ามใสทุกครั้งที่จด'
    expect(checkHook(long, thai).issues).toContain('tooLong')
    expect(
      checkHook(
        'A good hook for this pen is that it dries fast and never smears your notes again while you keep writing page after page without stopping',
        {
          ...thai,
          languageCode: 'en',
        },
      ).issues,
    ).toContain('tooLong')
  })

  it('fails numbers nobody supplied but accepts the ones in the facts', () => {
    expect(
      checkHook('หัว 0.5 มม. ที่เขียนคมทุกเส้น หมึกแห้งไว', thai).issues,
    ).not.toContain('unsupportedNumber')
    expect(checkHook('เขียนได้ 3000 เมตรต่อด้าม หมึกแห้งไว', thai).issues).toContain(
      'unsupportedNumber',
    )
    expect(checkHook('ราคา 259 บาท หมึกแห้งไว', thai).issues).toContain(
      'unsupportedNumber',
    )
  })

  it('fails another brand by whole word only', () => {
    expect(checkHook('ดีกว่า Maruderm เยอะ หมึกแห้งไว', thai).issues).toContain(
      'competitorBrand',
    )
    expect(
      checkHook('energel dries fast', {
        ...thai,
        languageCode: 'en',
        otherBrands: ['gel'],
      }).issues,
    ).not.toContain('competitorBrand')
  })

  it('notes when neither the product nor a payoff is named', () => {
    const r = checkHook('มันเขียนลื่นมาก', thai)
    expect(r.issues).toContain('notNamed')
    expect(r.hard).toBe(false)
  })
})

describe('picking the best hook', () => {
  it('drops a hook that fails a hard check even when its grade is higher', () => {
    const pick = pickBestHook(
      [
        { text: 'ปากกาด้ามนี้ มาดูรายละเอียดกัน', grade: 'A', source: 'original' },
        { text: 'หมึกแห้งไวจนปาดไม่เลอะ', grade: 'B+', source: 'original' },
      ],
      thai,
    )
    expect(pick.best?.text).toBe('หมึกแห้งไวจนปาดไม่เลอะ')
    expect(pick.passedChecks).toBe(true)
  })

  it('prefers a hook that names the payoff and uses the user style when grades are close', () => {
    const pick = pickBestHook(
      [
        { text: 'มันเขียนลื่นมากจริงๆ', grade: 'A-', source: 'original' },
        { text: 'หมึกแห้งไวจนปาดไม่เลอะมือ', grade: 'A-', source: 'format' },
      ],
      thai,
    )
    expect(pick.best?.source).toBe('format')
  })

  it('still returns something when every hook fails, and says the checks did not pass', () => {
    const pick = pickBestHook(
      [{ text: 'มาดูรายละเอียดกัน', grade: 'B+', source: 'original' }],
      thai,
    )
    expect(pick.best).not.toBeNull()
    expect(pick.passedChecks).toBe(false)
    expect(pickBestHook([], thai).best).toBeNull()
  })
})

describe('competitor brands from research titles', () => {
  it('collects capitalised names that are not the product or in the facts', () => {
    const brands = competitorBrandsFrom({
      titles: [
        'Pentel EnerGel-X Review Thailand',
        'Maruderm Daily Glow Serum Price',
        'Gel Pen Best Sellers Varnya',
      ],
      productName: 'Pentel EnerGel-X BLN105',
      notes: 'ปากกาเจล หมึกแห้งไว',
      supportText: 'gel ink Pentel',
    })
    expect(brands).toEqual(expect.arrayContaining(['Maruderm', 'Varnya']))
    expect(brands).not.toContain('Pentel')
    expect(brands).not.toContain('Review')
    expect(brands).not.toContain('Thailand')
    // Words the facts already use belong to the product.
    expect(brands).not.toContain('Gel')
  })
})

describe('prompts carry the rules that fix the weak runs', () => {
  const rubric = 'RUBRIC'

  it('the hook prompt transfers mechanisms and asks for one sentence', () => {
    const text = hookInstructions({ languageName: 'Thai', rubric })
    expect(text).toMatch(/mechanism/i)
    expect(text).toMatch(/skipped only when/i)
    expect(text).toMatch(/name that missing fact/i)
    expect(text).toMatch(/One sentence/i)
    expect(text).toMatch(/at least 8 candidates/i)
    expect(text).toContain(rubric)
  })

  it('the script prompt sells within supported facts and never talks about the label', () => {
    const text = scriptInstructions({
      languageName: 'Thai',
      durationSec: 30,
      rubric,
      budget: lengthBudget({ targetSec: 30, language: 'th' }),
    })
    expect(text).toMatch(/NO UNSUPPORTED CLAIMS, NOT NO PERSUASION/)
    expect(text).toMatch(/Never spend beats describing the label/)
    expect(text).toMatch(/LENGTH BUDGET/)
    expect(text).toMatch(/at most \d+ characters/)
  })

  it('the digest prompt treats the typed notes as the seller facts', () => {
    expect(digestInstructions('Thai')).toMatch(
      /seller's typed notes are the seller's own facts/,
    )
  })
})
