import type { Cue, Stage } from "./api";

// Thai words for the parts of a live. Kept in one place so the hero, the history and the chips say the same thing.
export const STAGE_LABEL: Record<Stage, string> = {
  open: "เปิดไลฟ์",
  features: "จุดเด่น",
  demo: "สาธิต",
  price: "ราคา",
  offer: "ข้อเสนอ",
  objection: "ตอบข้อสงสัย",
  chat: "คุยกับแชต",
  close: "ปิดไลฟ์",
  unknown: "กำลังฟัง",
};

// A reminder for the seller, taken from the suggestion. It only tells them what to show, it triggers nothing.
export const CUE_LABEL: Record<Cue, string> = {
  price: "โชว์ราคา",
  promo: "โชว์โปรโมชัน",
  gift: "โชว์ของแถม",
  flash: "โชว์โปรด่วน",
  product: "โชว์สินค้า",
};

export const WARNING_LABEL = {
  risk: "ระวังพูดเกินจริง",
  unsupported: "ยังไม่มีข้อมูลรองรับ",
} as const;
