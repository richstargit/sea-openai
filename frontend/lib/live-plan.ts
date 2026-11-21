"use client";

// Shared model for the live studio flow: คลังสินค้า → ตั้งค่าไลฟ์ (style, lineup) → เตรียม (dead-air videos,
// motion kit, script) → ห้องควบคุม (realtime detection, Decisions AI, speech, overlay). The plan lives in this
// browser per account; products live in the detection service catalog.
import { studioPost, studioRequest } from "@/components/studio/studio-api";
import type { SaleFormat } from "@/lib/sale-formats";

/** A product in the account's live catalog (Mongo). `id` is the CF code the detector reports; images are photo file ids. */
export type LiveProduct = { id: string; key?: string; name: string; description: string; distinct?: string; price: number; images: string[] };
export const productImage = (fileId: string) => `/agent/live/photos/${encodeURIComponent(fileId)}`;

export type TagStyle = "tag" | "sticker" | "receipt" | "flap";
export type LiveStyle = {
  shop: string;
  tone: string; // how the host talks, e.g. "สนุก เป็นกันเอง"
  language: "th" | "en";
  accent: string; // #rrggbb
  accent2: string;
  font: string;
  mood: string; // free text for the motion kit ("หรูหรา มินิมอล", "สดใส ป๊อป")
  tagStyle: TagStyle;
};
export type LineupItem = { productId: string; minutes: number; points: string; saleFormat?: SaleFormat };
/** A dead-air clip made for a product before the live; the host plays it on the overlay when needed. */
export type PreviewClip = { productId: string; fileId: string; url: string; name: string };

/** One layer of a `compose` graphic (backend/public/overlay/graphics/compose.js). Text may hold {name} {price} {code} {shop}. */
export type ComposeLayer = Record<string, string | number>;
/** A motion the AI designed for this shop; played as { type: "graphic", preset: "compose", data: { layers } }. */
export type CustomMotion = {
  id: string;
  name: string;
  /** the live moment it is for */
  moment: "intro" | "productIn" | "price" | "deal" | "callToAction" | "transition" | "celebrate" | "outro";
  description: string;
  /** seconds the motion lasts on screen */
  seconds: number;
  layers: ComposeLayer[];
};
/** Fill {name} {price} {code} {shop} in a custom motion's text layers for the product on screen. */
export function fillMotion(motion: CustomMotion, values: { name?: string; price?: number; code?: string; shop?: string }) {
  const map: Record<string, string> = { name: values.name ?? "", price: values.price === undefined ? "" : "฿" + values.price.toLocaleString("th-TH"), code: values.code ?? "", shop: values.shop ?? "" };
  return motion.layers.map((layer) => Object.fromEntries(Object.entries(layer).map(([k, v]) => [k, typeof v === "string" ? v.replace(/\{(name|price|code|shop)\}/g, (_, key: string) => map[key]) : v])));
}

export type MotionKit = {
  theme: { accent: string; accent2: string; look: "paper" | "ink" | "pop"; tagStyle: TagStyle };
  moments: Record<"intro" | "productIn" | "price" | "deal" | "callToAction" | "transition" | "celebrate" | "deadAir" | "outro", string>;
  sting: { headline: string; kicker: string; entrance: string };
  reasoning: string;
  /** motions the AI designed for this shop (AI Motion Designer), several per moment */
  custom?: CustomMotion[];
};
export type OverlayCue = { at: number; event: "product_card" | "price_pop" | "price_drop" | "free_badge" | "low_stock" | "poll" | "fireworks" | "zoom" | "caption"; note: string };
export type Segment = { kind: "intro" | "product" | "interlude" | "outro"; productId: string | null; title: string; seconds: number; opening: string; talkingPoints: string[]; callToAction: string; cues: OverlayCue[] };
export type ShowScript = { title: string; segments: Segment[] };

export type LivePlan = {
  style: LiveStyle; lineup: LineupItem[]; clips: PreviewClip[]; kit: MotionKit | null; script: ShowScript | null;
  /** motions the shop turned off for its lives: library preset ids and "custom:<id>" for AI-designed ones */
  off?: string[];
};
/** May the live use this motion? (library preset id, or "custom:<id>") */
export const motionOn = (plan: Pick<LivePlan, "off">, id: string) => !plan.off?.includes(id);

export const defaultPlan = (): LivePlan => ({
  style: { shop: "", tone: "สนุก เป็นกันเอง", language: "th", accent: "#d23b2a", accent2: "#1f6f5c", font: "", mood: "", tagStyle: "tag" },
  lineup: [], clips: [], kit: null, script: null,
});

const key = (userId: string) => "snappromo-live-plan:" + userId;
export function loadPlan(userId: string): LivePlan {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? { ...defaultPlan(), ...JSON.parse(raw) } : defaultPlan();
  } catch {
    return defaultPlan();
  }
}
export function savePlan(userId: string, plan: LivePlan) {
  try { localStorage.setItem(key(userId), JSON.stringify(plan)); } catch { /* storage is optional */ }
}

// ---------- catalog (Mongo, per account) ----------
type ProductInput = { id: string; name: string; description: string; distinct?: string; price: number; images: string[] };
const toBody = ({ id, ...rest }: Partial<ProductInput>) => ({ ...(id ? { code: id } : {}), ...rest });
export const catalog = {
  list: () => studioRequest<LiveProduct[]>("/agent/live/products"),
  /** images: 1–3 data URLs (JPEG/PNG/WebP). */
  add: (product: ProductInput) => studioPost<LiveProduct>("/agent/live/products", toBody(product)),
  /** Edit by current code; send images only to replace the photos. */
  update: (code: string, patch: Partial<ProductInput>) =>
    studioRequest<LiveProduct>("/agent/live/products/" + encodeURIComponent(code), {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toBody(patch)),
    }),
  remove: async (code: string) => {
    const response = await fetch("/agent/live/products/" + encodeURIComponent(code), { method: "DELETE" });
    if (!response.ok) throw new Error("ลบสินค้าไม่สำเร็จ");
  },
};

// ---------- AI (backend) ----------
const lineupFor = (plan: LivePlan, products: LiveProduct[]) =>
  plan.lineup.flatMap((item) => {
    const p = products.find((x) => x.id === item.productId);
    return p ? [{ id: p.id, name: p.name, description: p.description, distinct: p.distinct, price: p.price, minutes: item.minutes, points: item.points, saleFormat: item.saleFormat }] : [];
  });
export const director = {
  plan: (plan: LivePlan, products: LiveProduct[]) =>
    studioPost<ShowScript>("/agent/live/plan", { shop: plan.style.shop, tone: plan.style.tone, language: plan.style.language, lineup: lineupFor(plan, products) }),
  kit: (plan: LivePlan, products: LiveProduct[]) =>
    studioPost<MotionKit>("/agent/live/motion-kit", { shop: plan.style.shop, mood: plan.style.mood, accent: plan.style.accent, products: lineupFor(plan, products).map(({ name, description }) => ({ name, description })) }),
  /** Design `count` new motions for this shop (AI Motion Designer). */
  designMotions: (plan: LivePlan, products: LiveProduct[], count: number, moments?: CustomMotion["moment"][]) =>
    studioPost<{ motions: CustomMotion[] }>("/agent/live/motions", {
      shop: plan.style.shop, mood: plan.style.mood, accent: plan.style.accent, accent2: plan.style.accent2, count, moments,
      products: lineupFor(plan, products).map(({ name, price }) => ({ name, price })),
    }),
  /** One realtime decision: ~1 per second while live. image: a 512 px JPEG data URL from the detection bridge. */
  /** motions: preset ids the Decisions API may pick for this moment (kit presets first); omit for the curated set. */
  decide: (body: { image: string; transcript: string; products: Pick<LiveProduct, "id" | "name" | "description" | "distinct">[]; current: string | null; motions?: { id: string; description: string }[] }) =>
    studioPost<Decision>("/agent/live/decide", body),
};
export type Decision = {
  product: string | null; productConfidence: number | null; heldUp: number | null;
  action: "none" | "product_card" | "price_pop" | "price_drop" | "free_badge" | "low_stock" | "zoom" | "poll" | "fireworks";
  actionConfidence: number | null;
  /** a graphics preset id chosen by the Decisions API for this moment, or "none" */
  motion: string; motionConfidence: number | null;
  energy: "low" | "medium" | "high" | null; riskyClaim: number | null;
  teamCommand: "none" | "poll" | "fireworks" | "price_pop" | "zoom" | "product_card" | "dead_air_clip" | "next_segment" | null;
  latencyMs: number;
};
