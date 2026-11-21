/*
 * Demo content. Every product, price and line here is an illustrative sample
 * for the prototype, not a real shop, review or measured result.
 */

export type ProductKind = "food" | "cosmetic" | "craft";

export type ProductTheme = {
  kind: ProductKind;
  tab: string;
  name: string;
  price: string;
  /** scene background and the text colour that sits on it */
  bg: string;
  fg: string;
  /** the soft studio light behind the product */
  light: string;
  /** what vision reads from the photos */
  seen: { label: string; value: string }[];
  /** what Codex writes for this product */
  scene: string;
  motion: string;
  palette: string[];
  hook: string;
  selling: string;
  cta: string;
};

export const products: Record<ProductKind, ProductTheme> = {
  food: {
    kind: "food",
    tab: "อาหารแปรรูป",
    name: "น้ำพริกเผา",
    price: "฿89",
    bg: "#1f0f0a",
    fg: "#fff4e8",
    light: "oklch(0.62 0.17 45 / 0.55)",
    seen: [
      { label: "ประเภท", value: "อาหารแปรรูป" },
      { label: "สี", value: "แดงส้มเข้ม" },
      { label: "บรรจุภัณฑ์", value: "ขวดแก้ว ฝาดำ" },
      { label: "ต้องกรอก", value: "ราคา · โปรโมชัน" },
    ],
    scene:
      "พื้นหลังมืดอุ่น ไฟส้มสาดจากด้านหลัง ขวดหมุนช้า ๆ ข้อความเข้าด้วยจังหวะกระแทกสั้น ให้รู้สึกร้อนและหอม",
    motion: "กระแทกสั้น จังหวะเร็ว",
    palette: ["#1f0f0a", "#b3360f", "#fe7802", "#fff4e8"],
    hook: "ข้าวสวยร้อน ๆ ต้องมีขวดนี้",
    selling: "พริกคั่วเองทุกล็อต กลิ่นหอมตั้งแต่เปิดฝา",
    cta: "สั่งเลย วันนี้ราคาพิเศษ",
  },
  cosmetic: {
    kind: "cosmetic",
    tab: "เครื่องสำอาง",
    name: "ซีรั่มบำรุงผิว",
    price: "฿459",
    bg: "#f3e4da",
    fg: "#2b1d17",
    light: "oklch(0.98 0.02 70 / 0.9)",
    seen: [
      { label: "ประเภท", value: "ผลิตภัณฑ์ดูแลผิว" },
      { label: "สี", value: "ครีมมุก ฝาดำ" },
      { label: "บรรจุภัณฑ์", value: "ขวดหัวหยด" },
      { label: "ต้องกรอก", value: "ราคา · ปริมาณ" },
    ],
    scene:
      "ฉากสว่างนุ่ม แสงเหมือนห้องถ่ายภาพ ขวดลอยขึ้นช้า ๆ ตัวอักษรค่อย ๆ ปรากฏ ไม่มีอะไรเด้งแรง เพื่อให้ดูเชื่อถือได้",
    motion: "นุ่ม ช้า เรียบ",
    palette: ["#f3e4da", "#e8b898", "#2b1d17", "#fe7802"],
    hook: "ผิวแห้งตอนบ่าย? ลองหยดเดียว",
    selling: "เนื้อบางเบา ซึมไว ไม่เหนอะหนะ",
    cta: "ทักแชตรับโปรวันนี้",
  },
  craft: {
    kind: "craft",
    tab: "งานหัตถกรรม",
    name: "ตะกร้าสานมือ",
    price: "฿690",
    bg: "#d9cdb6",
    fg: "#2d2418",
    light: "oklch(0.95 0.04 85 / 0.8)",
    seen: [
      { label: "ประเภท", value: "งานหัตถกรรม" },
      { label: "สี", value: "น้ำตาลทอง" },
      { label: "วัสดุ", value: "สานด้วยมือ" },
      { label: "ต้องกรอก", value: "ราคา · ขนาด" },
    ],
    scene:
      "พื้นผ้าลินินโทนอบอุ่น เส้นสานถูกวาดขึ้นทีละเส้นก่อนภาพจริงปรากฏ เล่าที่มาของงานมือ ให้คนเห็นคุณค่าของเวลาที่ใช้ทำ",
    motion: "วาดเส้น เล่าเรื่อง",
    palette: ["#d9cdb6", "#c8924f", "#2d2418", "#fe7802"],
    hook: "ชิ้นนี้ใช้เวลาสานสามวัน",
    selling: "ทำมือทีละชิ้น ไม่มีสองใบที่เหมือนกัน",
    cta: "สั่งได้ในแชต เหลือไม่มาก",
  },
};

export const productList = [products.food, products.cosmetic, products.craft];

export type Hook = {
  id: "A" | "B" | "C";
  angle: string;
  line: string;
  note: string;
};

/** Three openings for the same product, to A/B on a platform. */
export const hooks: Hook[] = [
  {
    id: "A",
    angle: "ราคานำ",
    line: "สองขวด ฿159 วันนี้วันเดียว",
    note: "เปิดด้วยตัวเลข เหมาะกับคนที่เปรียบเทียบราคา",
  },
  {
    id: "B",
    angle: "ปัญหานำ",
    line: "ข้าวจืดอีกแล้ว? เปิดขวดนี้",
    note: "เปิดด้วยสิ่งที่คนเจอทุกวัน ให้หยุดเลื่อน",
  },
  {
    id: "C",
    angle: "เรื่องเล่า",
    line: "สูตรที่คั่วพริกด้วยเตาถ่าน",
    note: "เปิดด้วยที่มา เหมาะกับคนที่ซื้อเพราะเชื่อใจร้าน",
  },
];

/* ---------- Live assistant ---------- */

export type Intent = "price" | "shipping" | "ingredient" | "size" | "stock";

export const intentMeta: Record<
  Intent,
  { label: string; threshold: number; keywords: string[]; answer: string }
> = {
  price: {
    label: "ราคา",
    threshold: 3,
    keywords: ["ราคา", "กี่บาท", "เท่าไหร่", "เท่าไร", "แพงไหม", "ขวดละ"],
    answer: "ขวดละ 89 บาท ซื้อสองขวด 159 บาทค่ะ",
  },
  shipping: {
    label: "ค่าส่ง",
    threshold: 2,
    keywords: ["ส่งฟรี", "ค่าส่ง", "ส่งกี่วัน", "ส่งไหม", "ถึงเมื่อไหร่"],
    answer: "ส่งฟรีเมื่อซื้อครบ 299 บาท ส่งภายใน 2–3 วันค่ะ",
  },
  ingredient: {
    label: "ส่วนผสม",
    threshold: 2,
    keywords: ["ส่วนผสม", "ผสม", "วัตถุดิบ", "ใส่อะไร", "มีอะไรบ้าง", "แพ้"],
    answer: "พริกแห้ง กระเทียม หอมแดง น้ำตาลมะพร้าว ไม่ใส่สีค่ะ",
  },
  size: {
    label: "ขนาด",
    threshold: 2,
    keywords: ["ไซซ์", "ไซส์", "size", "ขนาด", "กี่กรัม", "กี่ml"],
    answer: "ขวดละ 200 กรัมค่ะ เก็บได้ประมาณ 3 เดือนก่อนเปิด",
  },
  stock: {
    label: "สต็อก",
    threshold: 2,
    keywords: ["มีของ", "เหลือไหม", "สต็อก", "ของหมด", "พร้อมส่ง"],
    answer: "พร้อมส่งค่ะ เหลือในสต็อกอีกไม่มาก",
  },
};

export function classify(text: string): Intent | null {
  const t = text.toLowerCase();
  const englishKeywords: Record<Intent, string[]> = {
    price: ["price", "how much", "cost", "expensive"],
    shipping: ["shipping", "delivery", "do you ship", "arrive"],
    ingredient: ["ingredient", "what is in", "what’s in", "allerg", "shrimp"],
    size: ["size", "gram", "volume", "how many ml"],
    stock: ["stock", "available", "any left", "sold out", "ready to ship"],
  };
  for (const [intent, meta] of Object.entries(intentMeta) as [
    Intent,
    (typeof intentMeta)[Intent],
  ][]) {
    if ([...meta.keywords, ...englishKeywords[intent]].some((k) => t.includes(k))) return intent;
  }
  return null;
}

/** A scripted audience the demo can replay. */
export const audienceScript: { user: string; text: string }[] = [
  { user: "นุ่น", text: "สวัสดีค่ะ" },
  { user: "ต้อม", text: "ราคาเท่าไหร่คะ" },
  { user: "แพร", text: "เผ็ดมากไหม" },
  { user: "บอล", text: "ส่วนผสมมีอะไรบ้างครับ" },
  { user: "มิ้ว", text: "กี่บาทคะ" },
  { user: "ฟ้า", text: "ส่งฟรีไหมคะ" },
  { user: "เอ", text: "ราคาขวดละเท่าไหร่" },
  { user: "ปอ", text: "ส่งกี่วันถึง" },
  { user: "ออม", text: "กี่กรัมคะ" },
  { user: "กอล์ฟ", text: "มีของพร้อมส่งไหม" },
  { user: "จูน", text: "ใส่อะไรบ้างคะ แพ้กุ้ง" },
  { user: "ไอซ์", text: "ขนาดเท่าไหร่" },
];

export const sampleComments = [
  "ราคาเท่าไหร่คะ",
  "ส่งฟรีไหม",
  "ส่วนผสมมีอะไรบ้าง",
  "กี่กรัมคะ",
];
