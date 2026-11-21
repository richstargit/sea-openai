// Speech → motion: what the host just said, mapped to the overlay motion that fits it (the editor's fast layer,
// no AI, < 50 ms). CONTRACT — the control room depends on exactly this shape. 
import type { LiveProduct } from "@/lib/live-plan";

/** One cue for the overlay. `needsProduct`: only play when the product is verified on camera (or named by the host). */
export type SpeechCue = {
  /** graphics preset id (backend/public/overlay/graphics) or a LiveCut event type */
  kind: "graphic" | "livecut";
  preset: string;
  data: Record<string, unknown>;
  needsProduct: boolean;
  /** short Thai reason shown in the director feed, e.g. 'ได้ยิน "ส่งฟรี"' */
  reason: string;
  /** higher wins when several cues match one sentence */
  priority: number;
};

const THAI_DIGITS = "๐๑๒๓๔๕๖๗๘๙";
/** Thai/Arabic digits to 0-9, "1,290" to "1290", whitespace collapsed. */
export const normalize = (t: string) =>
  t.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d))).replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/\s+/g, " ").trim();

const UNIT = "ชิ้น|ตัว|อัน|กล่อง|ขวด|ชุด|ที่|ออเดอร์|คู่|เซ็ต|หลอด|ถุง|แพ็ค|สี";
const STOCK = new RegExp(`เหลือ\\s*(?:แค่|เพียง|อีก)?\\s*(\\d+)\\s*(?:${UNIT})`);
const PRICE = [
  /(\d+(?:\.\d+)?)\s*(?:บาท|฿|บ\.)/,
  /฿\s*(\d+)/,
  new RegExp(`(?:ราคา|เหลือ|แค่|เพียง|เริ่มต้น|เริ่ม)\\s*(?:แค่|เพียง)?\\s*(\\d+)(?!\\d|\\s*(?:${UNIT}|%))`),
];
const DISCOUNT = /ลดเหลือ|ลดราคา|ลดแรง|ลดกระหน่ำ|ลด\s*\d+\s*(?:%|เปอร์เซ็นต์|บาท)?|ถูกลง|จาก\s*\d+.{0,12}?เหลือ\s*\d+/;

type Rule = { re: RegExp; priority: number; make: (n: string, m: RegExpMatchArray, p: LiveProduct | null, raw: string) => Omit<SpeechCue, "reason" | "priority"> | null };
const g = (preset: string, data: Record<string, unknown> = {}, needsProduct = false) => ({ kind: "graphic" as const, preset, data, needsProduct });
const lc = (preset: string, data: Record<string, unknown> = {}, needsProduct = true) => ({ kind: "livecut" as const, preset, data, needsProduct });
const stamp = (id: string, text: string, sub: string) => g(`stamp-${id}`, { text, sub });

const RULES: Rule[] = [
  { re: /หมดแล้ว|หมดเกลี้ยง|ของหมด|สินค้าหมด|sold ?out/i, priority: 90, make: (_n, _m, p) => g("sold-out", { name: p?.name, price: p?.price }, true) },
  {
    re: new RegExp(`เหลือน้อย|ชิ้นสุดท้าย|ตัวสุดท้าย|ใกล้หมด|ไม่กี่ชิ้น|${STOCK.source}`),
    priority: 85,
    make: (n, _m, p) => {
      const left = n.match(STOCK)?.[1];
      return lc("low_stock", { name: p?.name, ...(left ? { left: Number(left) } : {}) });
    },
  },
  {
    re: DISCOUNT,
    priority: 80,
    make: (n, _m, p) => {
      const pct = n.match(/ลด\s*(\d+)\s*(?:%|เปอร์เซ็นต์)/)?.[1];
      const off = !pct ? n.match(/ลด\s*(\d+)\s*บาท/)?.[1] : undefined;
      const nums = pct ? [] : (n.match(/\d+/g) ?? []).map(Number);
      let from: number | undefined, to: number | undefined;
      if (off) { from = p?.price; to = p ? p.price - Number(off) : undefined; }
      else if (nums.length >= 2 && nums[0] > nums[1]) [from, to] = nums;
      else if (nums.length === 1) { to = nums[0]; from = p && p.price > to ? p.price : undefined; }
      else if (p) { from = p.price; to = pct ? Math.round(p.price * (1 - Number(pct) / 100)) : undefined; }
      return lc("price_drop", { name: p?.name, ...(from != null ? { from } : {}), ...(to != null ? { to } : {}), ...(pct ? { percent: Number(pct) } : {}), ...(off ? { off: Number(off) } : {}) });
    },
  },
  { re: /ส่งฟรี|ฟรีค่าส่ง|ฟรีส่ง|ไม่เสียค่าส่ง/, priority: 70, make: () => stamp("free-ship", "ส่งฟรี", "ทั่วไทย") },
  {
    re: /ซื้อ\s*(\d+)\s*แถม\s*(\d+)/,
    priority: 68,
    make: (_n, m, p) => g("bundle-math-bogo", { name: p?.name, buy: Number(m[1]), get: Number(m[2]) }, true),
  },
  { re: /แถม|ของแถม|ฟรีทุก/, priority: 60, make: (n) => g("gift-unwrap", { giftName: n.match(/แถม\s*(?:ฟรี)?\s*([^\s,]{2,30})/)?.[1] ?? "ของแถม" }) },
  {
    re: /แฟลช\s*เซล|นาทีทอง|เวลาจำกัด|flash ?sale/i,
    priority: 60,
    make: (n) => {
      const min = n.match(/(\d+)\s*นาที/)?.[1];
      return g("flash-countdown", { label: "แฟลชเซล", ...(min ? { seconds: Number(min) * 60 } : {}) });
    },
  },
  {
    re: /โค้ด|คูปอง|voucher|coupon/i,
    priority: 55,
    make: (_n, _m, _p, raw) => {
      const code = raw.match(/(?:โค้ด|คูปอง)[^A-Za-z0-9]{0,8}([A-Za-z0-9]{3,20})(?![A-Za-z0-9])/)?.[1];
      return g("coupon-tear", code && /[A-Za-z]/.test(code) ? { code: code.toUpperCase() } : {});
    },
  },
  { re: /(?<![a-z])cf(?![a-z])|คอมเมนต์|คอมเม้น|พิมพ์/i, priority: 50, make: (_n, _m, p) => g("cf-keycaps", { code: p?.id ?? "" }, true) },
  { re: /กดตะกร้า|กดสั่ง|กดซื้อ|จิ้มตะกร้า|ตะกร้าเหลือง/, priority: 50, make: () => g("cart-press", { label: "กดตะกร้าเลย" }) },
  {
    re: /โหวต|เลือก.{0,8}ไหน|อยากได้แบบไหน|แบบไหนดี/,
    priority: 50,
    make: (n) => {
      const pair = n.match(/(\S+) หรือ (\S+)/);
      return lc("poll", { question: n.slice(0, 60), options: pair ? [{ label: pair[1], votes: 0 }, { label: pair[2], votes: 0 }] : [] }, false);
    },
  },
  { re: /ดูใกล้|ดูตรงนี้|ซูม|zoom/i, priority: 45, make: (_n, _m, p) => lc("zoom", { name: p?.name }) },
  { re: /มาใหม่|สินค้าใหม่|ใหม่ล่าสุด|ล็อตใหม่/, priority: 40, make: () => stamp("new", "มาใหม่", "ล็อตใหม่ล่าสุด") },
  { re: /ขายดี|เบสต์เซลเลอร์|bestseller/i, priority: 40, make: () => stamp("bestseller", "ขายดี", "อันดับ 1 ของร้าน") },
  {
    re: /รีวิว|ลูกค้าชอบ|ลูกค้าติดใจ|ซื้อซ้ำ|ดาว/,
    priority: 40,
    make: (n) => {
      const r = n.match(/(\d(?:\.\d)?)\s*ดาว/)?.[1];
      return g("review-stars", r && Number(r) <= 5 ? { rating: Number(r) } : {});
    },
  },
  {
    re: /ส่วนผสม|สเปก|สเปค|คุณสมบัติ|spec/i,
    priority: 35,
    make: (n) => {
      const inner = n.match(/มี\s*(.+?)\s*เป็นส่วนผสม/)?.[1];
      const claims = (inner ? inner.split(/และ|กับ|,| /) : [n]).map((c) => c.trim()).filter(Boolean).slice(0, 4).map((c) => c.slice(0, 40));
      return g("kinetic-claim", { claims });
    },
  },
  { re: /ยอดทะลุ|ทะลุ\s*\d+/, priority: 32, make: () => lc("fireworks", {}, false) },
  { re: /ขอบคุณ|เย้|ขอบใจ/, priority: 30, make: () => g("heart-burst", { count: 128 }) },
  { re: /ต่อไป|ตัวถัดไป|สินค้าถัดไป|ตัวต่อไป/, priority: 20, make: () => g("iris-swap", { kicker: "ต่อไป" }) },
];

/**
 * Cues for one finished sentence. `product` is the product the host is talking about (verified on camera, or the
 * segment's product when the sentence names it); price/discount numbers are read from the sentence itself.
 * At most 2 cues, highest priority first.
 */
export function cuesFromSpeech(sentence: string, product: LiveProduct | null): SpeechCue[] {
  const n = normalize(sentence);
  const raw = sentence.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));
  const out: SpeechCue[] = [];
  for (const r of RULES) {
    const m = n.match(r.re);
    if (!m) continue;
    const c = r.make(n, m, product, raw);
    if (c) out.push({ ...c, reason: `ได้ยิน "${m[0].trim()}"`, priority: r.priority });
  }
  // a price said without a discount/stock/sold-out cue: price pop (a discount already carries its own numbers)
  if (!out.some((c) => ["price_drop", "sold-out", "low_stock"].includes(c.preset)) && !/ซื้อ\s*\d+\s*แถม/.test(n)) {
    for (const re of PRICE) {
      const m = n.match(re);
      const price = m && Number(m[1]);
      if (price) { out.push({ ...lc("price_pop", { price, name: product?.name }), reason: `ได้ยิน "${m[0].trim()}"`, priority: 65 }); break; }
    }
  }
  return out.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

/** Does the sentence name this product (name, a distinctive word ≥ 3 chars, or its CF code as a token)? */
export function namesProduct(sentence: string, product: LiveProduct): boolean {
  const s = normalize(sentence).toLowerCase();
  const name = normalize(product.name).toLowerCase();
  if (name && s.includes(name)) return true;
  const tokens = [product.id, product.key].filter((t): t is string => !!t && /^[A-Za-z0-9]{2,}$/.test(t));
  if (tokens.some((t) => new RegExp(`(?<![a-z0-9])${t.toLowerCase()}(?![a-z0-9])`).test(s))) return true;
  const words = [...name.split(/[\s\-_/()]+/), ...(product.distinct ? normalize(product.distinct).toLowerCase().split(/[\s,]+/) : [])];
  // shortcut: Thai has no spaces, so a name written as one run is matched whole only; upgrade with a word segmenter
  return words.some((w) => w.length >= 3 && /[a-z\u0e00-\u0e7f]/.test(w) && !/^\d+(ml|g|mg|กรัม|มล)?$/.test(w) && (/^[a-z0-9]+$/.test(w) ? new RegExp(`(?<![a-z0-9])${w}(?![a-z0-9])`).test(s) : s.includes(w)));
}
