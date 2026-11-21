"use client";

// The backend runs the whole video as one job: script, voice, picture, mixing.
// One POST starts it, then the job is read until it is ready. Same origin like the rest of the studio:
// Next forwards /agent/* to the backend and the browser sends the session cookie on its own.
const ROOT = "/agent/hook-machine/videos";
const REMEMBER = "snappromo-video-job";

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
  file: { url: string; sizeBytes: number; durationSec: number } | null;
};

export type CreateVideoInput = {
  profileId: string;
  brief: string;
  images: string[];
  durationSec: VideoLength;
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
