// Canned AI answers for HOOK_MACHINE_MOCK_AI=true. They exist so the whole UI
// can be explored without an OpenAI key. Nothing here comes from a real model.

const pattern = (name: string) => ({
  name,
  description: `ตัวอย่างรูปแบบ "${name}" (ข้อมูลจำลอง)`,
  evidence: 'ข้อมูลจำลองจากโหมดเดโม',
})

const FIXTURES: Record<string, unknown> = {
  video_analysis: {
    hookText: '(เดโม) ของชิ้นนี้ราคาไม่ถึงร้อย แต่ผมใช้มันทุกวันมาสามปีแล้ว',
    hookLabel: 'ราคาถูก + ใช้จริงนาน',
    formula: '[สินค้า] ราคา[ตัวเลขต่ำ] แต่ผม[ใช้/ทำ][ผลลัพธ์ระยะยาว]',
    psychology: ['ความขัดแย้งระหว่างราคากับคุณภาพ', 'หลักฐานจากการใช้จริง'],
    triggerWords: ['ไม่ถึงร้อย', 'ทุกวัน', 'สามปี'],
    structureNotes: 'ประโยคบอกเล่าสั้น ใส่ตัวเลขสองตัวในประโยคเดียว',
    visualHook: 'ถือสินค้าใกล้กล้อง ตัวหนังสือราคาขนาดใหญ่ตัดเข้าในวินาทีที่ 1',
    bodyBeats: [
      { name: 'ปัญหา', summary: 'เล่าปัญหาที่เจอมาก่อน', approxSec: 5 },
      { name: 'สาธิต', summary: 'โชว์การใช้งานจริง', approxSec: 10 },
    ],
    cta: 'กดตะกร้าเหลืองด้านล่างได้เลย',
    tone: 'เป็นกันเอง พูดตรง',
    whyItWorks: 'ตัวเลขให้ภาพชัดทันที และมีความขัดแย้งให้อยากรู้ต่อ',
  },
  profile_insights: {
    styleSummary:
      '(เดโม) พูดตรง สั้น เปิดด้วยตัวเลขและความขัดแย้ง ตัดภาพเร็ว ปิดด้วยการชวนกดตะกร้า',
    voice: {
      tone: 'เป็นกันเอง มั่นใจ',
      persona: 'คนใช้จริงที่เล่าให้เพื่อนฟัง',
      sentenceStyle: 'ประโยคสั้น ไม่เกินสิบสองคำ',
      vocabulary: ['ใช้จริง', 'ไม่ถึงร้อย', 'คุ้มมาก'],
      avoid: ['ศัพท์เทคนิค', 'คำโฆษณาใหญ่เกินจริง'],
    },
    hookFormats: [
      {
        label: 'ราคาถูก + ใช้จริงนาน',
        original: '(เดโม) ของชิ้นนี้ราคาไม่ถึงร้อย แต่ผมใช้มันทุกวันมาสามปีแล้ว',
        formula: '[สินค้า] ราคา[ตัวเลขต่ำ] แต่ผม[ใช้][ระยะเวลา]',
        sourceIndex: 1,
        whyItWorks: 'ความขัดแย้งราคากับคุณภาพ',
      },
      {
        label: 'ผมเคยพลาดมาก่อน',
        original: '(เดโม) ผมเสียเงินไปสองพันกว่าจะรู้ว่าต้องซื้อแบบนี้',
        formula: 'ผมเสีย[จำนวนเงิน] กว่าจะรู้ว่า[บทเรียน]',
        sourceIndex: 1,
        whyItWorks: 'เล่าความผิดพลาดจริงพร้อมตัวเลข',
      },
    ],
    patterns: {
      psychology: [pattern('ความขัดแย้ง'), pattern('หลักฐานการใช้จริง')],
      triggerWords: [pattern('ตัวเลขเฉพาะ')],
      grammar: [pattern('ประโยคบอกเล่าสั้น')],
      pacingAndVisual: [pattern('ตัดภาพทุกสองวินาที')],
    },
    structureTemplate: [
      { name: 'Hook', purpose: 'ตัวเลข + ความขัดแย้ง', typicalSec: 3 },
      { name: 'ปัญหา', purpose: 'ให้คนดูรู้สึกว่านี่คือเรา', typicalSec: 5 },
      { name: 'สาธิต', purpose: 'โชว์ผลจริง', typicalSec: 12 },
      { name: 'CTA', purpose: 'ชวนกดตะกร้า', typicalSec: 4 },
    ],
    ctaPatterns: ['กดตะกร้าเหลืองด้านล่างได้เลย'],
    customPrinciples: [pattern('ใส่ตัวเลขอย่างน้อยหนึ่งตัวในประโยคแรก')],
  },
  product_brief: {
    productName: '(เดโม) สินค้าตัวอย่าง',
    category: 'ของใช้ในบ้าน',
    audience: 'คนวัยทำงานที่อยากได้ของคุ้มราคา',
    keywords: ['คุ้มราคา', 'ใช้ทุกวัน'],
    searchQueries: ['รีวิวสินค้าตัวอย่าง'],
    visibleFacts: ['ข้อมูลจากรูปและโน้ตที่ผู้ใช้ให้มา'],
  },
  research_digest: {
    facts: [
      { claim: 'ผู้ใช้ระบุว่าสินค้าราคาไม่ถึงร้อยบาท', source: 'user', sourceUrl: null },
    ],
    sellingPoints: ['ราคาเข้าถึงง่าย', 'ใช้ได้ทุกวัน'],
    painPoints: ['ของแพงแต่ใช้ไม่คุ้ม'],
    objections: ['ของถูกจะพังเร็วหรือเปล่า'],
    claimsToVerify: ['ระยะเวลาการใช้งานจริง'],
  },
  hook_set: {
    formatMatched: [
      {
        formatLabel: 'ราคาถูก + ใช้จริงนาน',
        text: 'ไม่ถึงร้อยบาท แต่ผมหยิบมันมาใช้ทุกวัน',
        grade: 'A-',
        note: 'ตัวเลขชัด ขัดกับความคาดหวัง (เดโม)',
      },
    ],
    skippedFormats: [
      {
        formatLabel: 'ผมเคยพลาดมาก่อน',
        reason: 'ไม่มีข้อมูลความผิดพลาดจริงให้ใช้ ต้องแต่งขึ้นเอง',
      },
    ],
    original: [
      {
        text: 'ของแพงไม่ได้ดีกว่าเสมอ ดูอันนี้',
        grade: 'B+',
        note: 'ความขัดแย้งชัด (เดโม)',
      },
      { text: 'ทำไมคนใช้ซ้ำกันทั้งออฟฟิศ', grade: 'B+', note: 'ชวนสงสัย (เดโม)' },
    ],
  },
  script: {
    title: '(เดโม) สคริปต์ตัวอย่าง',
    totalSec: 28,
    beats: [
      {
        section: 'hook',
        startSec: 0,
        endSec: 3,
        voiceover: 'ไม่ถึงร้อยบาท แต่ผมหยิบมันมาใช้ทุกวัน',
        imageIndex: 0,
      },
      {
        section: 'problem',
        startSec: 3,
        endSec: 9,
        voiceover: 'ก่อนหน้านี้ผมซื้อของแพงมาตลอด แล้วก็เก็บทิ้งไว้เฉย ๆ',
        imageIndex: null,
      },
      {
        section: 'demo',
        startSec: 9,
        endSec: 22,
        voiceover: 'ลองดูตอนใช้จริง หยิบแล้วใช้ได้เลย ไม่ต้องตั้งค่าอะไร',
        imageIndex: 1,
      },
      {
        section: 'cta',
        startSec: 22,
        endSec: 28,
        voiceover: 'อยากลองก็กดตะกร้าเหลืองด้านล่างได้เลย',
        imageIndex: 0,
      },
    ],
    caption: '(เดโม) ของคุ้มที่ใช้ทุกวัน',
    hashtags: ['#รีวิว', '#ของดีบอกต่อ'],
  },
  voice_translation: {
    lines: [
      'Under one hundred baht, and I use it every day',
      'I used to buy pricey ones and leave them in a drawer',
      'Try it for real, pick it up and it just works',
      'Tap the yellow basket below if you want one',
    ],
  },
  hook_review: {
    lines: [
      { line: 'ตัวอย่างฮุกของผู้ใช้', grade: 'B', comment: 'ข้อมูลจำลองจากโหมดเดโม' },
    ],
    overall: 'B',
    summary: 'ฮุกใช้ได้แต่ยังขาดตัวเลขเฉพาะ (เดโม)',
    rewrites: [
      {
        text: 'ไม่ถึงร้อยบาท แต่ใช้ได้ทุกวัน',
        grade: 'A-',
        whyStronger: 'เพิ่มตัวเลขและความขัดแย้ง',
      },
      {
        text: 'ทำไมของถูกชิ้นนี้ถึงไม่เคยหายจากโต๊ะผม',
        grade: 'B+',
        whyStronger: 'เปลี่ยนเป็นคำถามชวนสงสัย',
      },
      {
        text: 'ผมใช้มันสามปี ราคาไม่ถึงร้อย',
        grade: 'A-',
        whyStronger: 'ใส่หลักฐานการใช้จริง',
      },
    ],
  },
}

export function mockFor(name: string): unknown {
  const fixture = FIXTURES[name]
  if (!fixture) throw new Error(`No demo fixture for AI step "${name}"`)
  return fixture
}
