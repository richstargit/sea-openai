// Canned model answers for HOOK_MACHINE_MOCK_AI=true so the live script flow
// can be explored without spending tokens. Nothing here comes from a model.
// They contain no digits and no urgency words, so they pass every check for
// any offer a seller types.

const FIXTURES: Record<string, unknown> = {
  live_brief: {
    productName: 'สินค้าตัวอย่าง',
    category: 'ของใช้ในบ้าน',
    audience: 'คนที่เปิดดูไลฟ์ระหว่างวัน',
    keywords: ['ใช้ง่าย', 'คุ้มค่า'],
    searchQueries: ['รีวิวสินค้าตัวอย่าง'],
    visibleFacts: ['ข้อมูลจากโน้ตของผู้ขาย'],
  },
  live_digest: {
    facts: [
      { claim: 'ผู้ขายบอกว่าสินค้าใช้ได้ทุกวัน', source: 'user', sourceUrl: null },
    ],
    sellingPoints: ['ใช้ง่าย', 'เหมาะกับทุกวัน'],
    painPoints: ['ของที่ซื้อมาแล้วใช้ไม่คุ้ม'],
    objections: ['ใช้ทนไหม'],
    claimsToVerify: ['อายุการใช้งานจริง'],
  },
  live_hooks: {
    formatMatched: [],
    skippedFormats: [],
    original: [
      {
        text: 'เพิ่งเข้ามาใช่ไหม มาดูของที่ใช้ได้ทุกวันกัน',
        grade: 'B+',
        note: 'ชวนคนเพิ่งเข้ามา',
      },
      { text: 'ของชิ้นนี้ทำไมคนถึงหยิบมาใช้ซ้ำ ดูกัน', grade: 'B+', note: 'ชวนสงสัย' },
      { text: 'ถ้าเบื่อของที่ซื้อแล้วไม่ได้ใช้ ลองดูอันนี้', grade: 'A-', note: 'ตรงปัญหา' },
    ],
  },
  live_show: {
    rehooks: [
      {
        text: 'ใครเพิ่งเข้ามา เรากำลังดูของที่ใช้ได้ทุกวันอยู่นะ',
        grade: 'B+',
        note: 'ทักคนใหม่',
      },
      {
        text: 'มาทันพอดี ตอนนี้กำลังโชว์ตัวสินค้าให้ดูใกล้ๆ',
        grade: 'B+',
        note: 'บอกว่ากำลังทำอะไร',
      },
      {
        text: 'เพิ่งเปิดมาก็ตามทัน เรากำลังคุยเรื่องการใช้งานจริง',
        grade: 'B+',
        note: 'ตามทันง่าย',
      },
      {
        text: 'สวัสดีคนใหม่ ตอนนี้เรากำลังเล่าว่าของชิ้นนี้ช่วยอะไร',
        grade: 'B+',
        note: 'ทักทายและบอกเรื่อง',
      },
    ],
    engagement: [
      'ใครเคยใช้ของแบบนี้แล้วชอบหรือไม่ชอบ พิมพ์บอกกันหน่อย',
      'อยากให้เราลองโชว์ตรงไหนเพิ่ม พิมพ์ในแชตได้เลย',
      'ปกติเลือกซื้อของแบบนี้จากอะไรเป็นหลัก',
    ],
    segment: {
      variants: [
        {
          label: 'เล่าจากปัญหา',
          lines: [
            { part: 'hook', text: 'ของที่ซื้อมาแล้วไม่ได้ใช้ มีใครเป็นบ้าง' },
            { part: 'problem', text: 'หลายคนเลือกของแล้วใช้ไม่เข้ากับชีวิตจริง' },
            { part: 'demo', text: 'ลองดูตอนใช้งาน หยิบแล้วใช้ได้เลย ไม่ยุ่งยาก' },
            { part: 'proof', text: 'ผู้ขายใช้เองทุกวัน และเล่าให้ฟังตามที่ใช้จริง' },
            { part: 'offer', text: 'รายละเอียดข้อเสนออยู่ที่ป้ายบนจอ' },
            { part: 'cta', text: 'สนใจกดตะกร้าด้านล่างได้เลย' },
          ],
        },
        {
          label: 'เล่าจากการใช้งาน',
          lines: [
            { part: 'hook', text: 'มาดูวิธีใช้ที่ง่ายที่สุดของชิ้นนี้กัน' },
            { part: 'problem', text: 'ของบางอย่างต้องตั้งค่ายุ่งยาก จนไม่อยากหยิบมาใช้' },
            { part: 'demo', text: 'อันนี้หยิบมาแล้วเริ่มได้เลย ดูตามได้เลย' },
            { part: 'proof', text: 'สิ่งที่เล่าทั้งหมดมาจากการใช้งานจริงของผู้ขาย' },
            { part: 'offer', text: 'ดูข้อเสนอล่าสุดที่ป้ายบนจอ' },
            { part: 'cta', text: 'ถ้าชอบ กดตะกร้าเก็บไว้ก่อนได้เลย' },
          ],
        },
      ],
    },
    objections: [
      {
        question: 'ใช้ทนไหม',
        answer: 'ผู้ขายใช้ทุกวันตามที่เล่า ถ้าอยากรู้ละเอียดจะเช็กข้อมูลเพิ่มให้',
        ifUnknown: 'ข้อนี้ขอเช็กข้อมูลก่อน เดี๋ยวกลับมาตอบให้',
      },
    ],
    transitions: [
      { label: 'เริ่มไลฟ์', text: 'สวัสดีทุกคน วันนี้มีของมาให้ดูกัน' },
      { label: 'ก่อนพักสั้น', text: 'เดี๋ยวกลับมาเล่าต่อ ใครมีคำถามพิมพ์ไว้ได้เลย' },
    ],
    closing: ['ขอบคุณทุกคนที่อยู่ด้วยกัน ไว้เจอกันไลฟ์หน้า'],
    cues: [
      {
        where: 'segment_offer',
        kind: 'product',
        note: 'เปิดป้ายสินค้าตอนพูดถึงข้อเสนอ',
      },
    ],
  },
  live_verify: { unsupported: [] },
  live_next: {
    next: ['ตรงนี้ดูได้ชัดเลย เล่าให้ฟังต่อได้เลย'],
  },
  live_classify: {
    stage: 'features',
    topicIndex: -1,
    aboutProduct: true,
    risky: false,
    unsupported: false,
  },
  live_reply: {
    reply: 'ข้อนี้ขอเช็กข้อมูลก่อน เดี๋ยวกลับมาตอบให้',
    status: 'unknown',
    basis: [],
    sellerNote: 'ยังไม่มีข้อมูลที่ยืนยันได้ในชุดนี้',
  },
}

export function mockFor(name: string): unknown {
  const fixture = FIXTURES[name]
  if (!fixture) throw new Error(`No live script fixture for AI step ${name}`)
  return fixture
}
