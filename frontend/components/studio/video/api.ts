"use client";

import type { SaleFormat } from "@/lib/sale-formats";

// The backend runs the whole video as one job: script, voice, picture, mixing.
// One POST starts it, then the job is read until it is ready. Same origin like the rest of the studio:
// Next forwards /agent/* to the backend and the browser sends the session cookie on its own.
const ROOT = "/agent/hook-machine/videos";
const REMEMBER = "snappromo-video-job";
const REMEMBER_ASPECT = "snappromo-video-aspect";

export const STEPS = ["brief", "research", "hooks", "script", "voice", "compose"] as const;
export type VideoStep = (typeof STEPS)[number];

export const STEP_LABEL: Record<VideoStep, string> = {
  brief: "อ่านรูปและไอเดีย",
  research: "ค้นข้อมูลสินค้า",
  hooks: "คิดฮุก",
  script: "เขียนบทพูด",
  voice: "ทำเสียงพากย์",
  compose: "ประกอบคลิป",
};

export type VideoLength = 15 | 30 | 45 | 60;
export const LENGTHS: VideoLength[] = [15, 30, 45, 60];

export type VideoVoice = { language?: string; voice?: string; model?: string };

/** The frame shapes the backend renders. Sizes are the output pixels, `w` and `h` only give the ratio. */
export type Aspect = "9:16" | "4:5" | "1:1" | "16:9";
export const DEFAULT_ASPECT: Aspect = "9:16";
export const ASPECTS: { id: Aspect; w: number; h: number; width: number; height: number; word: string; hint: string }[] = [
  { id: "9:16", w: 9, h: 16, width: 1080, height: 1920, word: "แนวตั้ง", hint: "TikTok, Reels, Shorts" },
  { id: "4:5", w: 4, h: 5, width: 1080, height: 1350, word: "ฟีด", hint: "ฟีด Instagram และ Facebook" },
  { id: "1:1", w: 1, h: 1, width: 1080, height: 1080, word: "จัตุรัส", hint: "ฟีดแบบสี่เหลี่ยม" },
  { id: "16:9", w: 16, h: 9, width: 1920, height: 1080, word: "แนวนอน", hint: "YouTube" },
];

export type VideoJob = {
  id: string;
  profileId: string;
  status: "running" | "ready" | "error";
  step: VideoStep | null;
  stepIndex: number;
  stepCount: number;
  /** Already a Thai message meant for the user. */
  error: string | null;
  createdAt: string;
  durationSec: number;
  voiceLanguage: string;
  /** Older jobs may not carry the shape, so the page falls back to what was chosen. */
  aspect?: Aspect;
  width?: number;
  height?: number;
  file: { url: string; sizeBytes: number; durationSec: number } | null;
};

export type CreateVideoInput = {
  profileId: string;
  saleFormat?: SaleFormat;
  brief: string;
  images: string[];
  durationSec: VideoLength;
  aspect?: Aspect;
  voice?: VideoVoice;
};

export class VideoApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOT}${path}`, { ...init, cache: "no-store" }).catch(() => {
    throw new VideoApiError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้", 0);
  });
  if (response.status === 401) throw new VideoApiError("กรุณาเข้าสู่ระบบอีกครั้ง", 401);
  const body = (await response.json().catch(() => null)) as (T & { message_TH?: string; message?: string }) | null;
  if (!response.ok || !body) throw new VideoApiError(body?.message_TH ?? body?.message ?? "เกิดข้อผิดพลาด", response.status);
  return body;
}

export const videoApi = {
  create: (input: CreateVideoInput) =>
    request<{ video: VideoJob }>("", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then((r) => r.video),
  get: (id: string) => request<{ video: VideoJob }>(`/${id}`).then((r) => r.video),
  list: () => request<{ videos: VideoJob[] }>("").then((r) => r.videos),
};

export const videoFileUrl = (id: string, download = false) => `${ROOT}/${id}/file${download ? "?download=1" : ""}`;

// The latest job is remembered so a refresh picks the work up again. Storage can be blocked, so it is always optional.
export function recallJob(): string {
  try { return localStorage.getItem(REMEMBER) ?? ""; } catch { return ""; }
}
export function rememberJob(id: string) {
  try { localStorage.setItem(REMEMBER, id); } catch { /* storage is optional */ }
}
export function forgetJob() {
  try { localStorage.removeItem(REMEMBER); } catch { /* storage is optional */ }
}

export function recallAspect(): Aspect | null {
  try {
    const saved = localStorage.getItem(REMEMBER_ASPECT);
    return ASPECTS.some((a) => a.id === saved) ? (saved as Aspect) : null;
  } catch { return null; }
}
export function rememberAspect(aspect: Aspect) {
  try { localStorage.setItem(REMEMBER_ASPECT, aspect); } catch { /* storage is optional */ }
}
