"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  Capabilities,
  VoiceOptions,
  Profile,
  ProfileSummary,
  Project,
  ProjectSummary,
} from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const ROOT = `${BASE}/api/hook-machine`;

export function takeAudioUrl(projectId: string, takeId: string, download = false): string {
  return `${ROOT}/projects/${projectId}/voice/takes/${takeId}/audio${download ? "?download=1" : ""}`;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${ROOT}${path}`, {
      ...init,
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจว่ารัน backend ที่พอร์ต 8080 แล้ว", 0);
  }
  const body = (await response.json().catch(() => null)) as
    | (T & { success?: boolean; message_TH?: string; message?: string })
    | null;
  if (!response.ok || !body) {
    throw new ApiError(body?.message_TH ?? body?.message ?? "เกิดข้อผิดพลาด", response.status);
  }
  return body;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const api = {
  capabilities: () => call<Capabilities>("/capabilities"),
  profiles: () => call<{ profiles: ProfileSummary[] }>("/profiles").then((r) => r.profiles),
  createProfile: (name: string, language: "th" | "en") =>
    call<{ profile: Profile }>("/profiles", post({ name, language })).then((r) => r.profile),
  profile: (id: string) => call<{ profile: Profile }>(`/profiles/${id}`).then((r) => r.profile),
  addSources: (id: string, urls: string[]) =>
    call<{ profile: Profile; rejected: string[] }>(`/profiles/${id}/sources`, post({ urls })),
  removeSource: (id: string, sourceId: string) =>
    call<{ profile: Profile }>(`/profiles/${id}/sources/${sourceId}`, { method: "DELETE" }),
  analyze: (id: string) => call<unknown>(`/profiles/${id}/analyze`, { method: "POST" }),
  projects: (id: string) =>
    call<{ projects: ProjectSummary[] }>(`/profiles/${id}/projects`).then((r) => r.projects),
  createProject: (
    id: string,
    input: { title: string; notes: string; productUrl: string; images: string[]; durationSec: number },
  ) => call<{ project: Project }>(`/profiles/${id}/projects`, post(input)).then((r) => r.project),
  project: (id: string) => call<{ project: Project }>(`/projects/${id}`).then((r) => r.project),
  chooseHook: (id: string, hook: string) => call<unknown>(`/projects/${id}/hook`, post({ hook })),
  voiceOptions: () => call<VoiceOptions>("/voice/options"),
  createVoice: (
    id: string,
    body: { language: string; model: string; voice: string; styles: string[] },
  ) => call<{ voice: NonNullable<Project["voice"]> }>(`/projects/${id}/voice`, post(body)).then((r) => r.voice),
  rateTake: (id: string, takeId: string, stars: number) =>
    call<{ project: Project }>(`/projects/${id}/voice/takes/${takeId}/rating`, post({ stars })).then((r) => r.project),
  gradeHook: (id: string, hook: string) =>
    call<{ project: Project }>(`/projects/${id}/grade`, post({ hook })).then((r) => r.project),
};

/**
 * Loads a document and keeps refreshing it while the server reports it is
 * still working, so progress shows without the user reloading.
 */
const isRunning = (data: { status: string }) => data.status === "running";

export function useLive<T extends { status: string }>(
  load: () => Promise<T>,
  // Decides when to keep refreshing. Must be a stable reference.
  isWorking: (data: T) => boolean = isRunning,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `load` must be stable (wrap it in useCallback) or this refetches every render.
  const refresh = useCallback(async () => {
    try {
      const next = await load();
      setData(next);
      setError(null);
      return next;
    } catch (e) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      return null;
    }
  }, [load]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const first = async () => {
      const next = await refresh();
      // Retry slowly if the server could not be reached.
      if (!stopped && !next) timer = setTimeout(first, 5000);
    };
    void first();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  // While the server is working, keep refreshing so progress shows live.
  const working = data ? isWorking(data) : false;
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => void refresh(), 2000);
    return () => clearInterval(timer);
  }, [working, refresh]);

  return { data, error, refresh, setData };
}

/** Shrinks a photo in the browser so the request stays small. */
export async function shrinkImage(file: File, maxSide = 900): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ย่อรูปไม่ได้");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.8, 0.65, 0.5]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length < 400_000) return url;
  }
  throw new Error("รูปใหญ่เกินไป ลองรูปอื่น");
}
