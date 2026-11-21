"use client";

import { useCallback, useEffect, useState } from "react";
import type { Capabilities, Profile, ProfileSummary, Project, ProjectSummary, VoiceOptions } from "./types";

// Same origin, like the rest of the studio: Next forwards /agent/* to the backend
// and the browser sends the session cookie on its own.
const ROOT = "/agent/hook-machine";

export const takeAudioUrl = (projectId: string, takeId: string, download = false) =>
  `${ROOT}/projects/${projectId}/voice/takes/${takeId}/audio${download ? "?download=1" : ""}`;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${ROOT}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store",
  }).catch(() => {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  });
  if (response.status === 401) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
  const body = (await response.json().catch(() => null)) as (T & { message_TH?: string; message?: string }) | null;
  if (!response.ok || !body) throw new Error(body?.message_TH ?? body?.message ?? "เกิดข้อผิดพลาด");
  return body;
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const patch = (body: unknown): RequestInit => ({ method: "PATCH", body: JSON.stringify(body) });

export const api = {
  capabilities: () => call<Capabilities>("/capabilities"),
  profiles: () => call<{ profiles: ProfileSummary[] }>("/profiles").then((r) => r.profiles),
  createProfile: (name: string) => call<{ profile: Profile }>("/profiles", post({ name, language: "th" })).then((r) => r.profile),
  profile: (id: string) => call<{ profile: Profile }>(`/profiles/${id}`).then((r) => r.profile),
  renameProfile: (id: string, name: string) => call<{ profile: Profile }>(`/profiles/${id}`, patch({ name })).then((r) => r.profile),
  deleteProfile: (id: string) => call<{ removedProjects: number }>(`/profiles/${id}`, { method: "DELETE" }),
  addSources: (id: string, urls: string[]) => call<{ profile: Profile; rejected: string[] }>(`/profiles/${id}/sources`, post({ urls })),
  removeSource: (id: string, sourceId: string) => call<{ profile: Profile }>(`/profiles/${id}/sources/${sourceId}`, { method: "DELETE" }),
  analyze: (id: string, redo = false) => call<unknown>(`/profiles/${id}/analyze`, redo ? post({ redo: true }) : { method: "POST" }),
  projects: (id: string) => call<{ projects: ProjectSummary[] }>(`/profiles/${id}/projects`).then((r) => r.projects),
  createProject: (id: string, input: { title: string; notes: string; productUrl: string; images: string[]; durationSec: number }) =>
    call<{ project: Project }>(`/profiles/${id}/projects`, post(input)).then((r) => r.project),
  project: (id: string) => call<{ project: Project }>(`/projects/${id}`).then((r) => r.project),
  chooseHook: (id: string, hook: string) => call<unknown>(`/projects/${id}/hook`, post({ hook })),
  gradeHook: (id: string, hook: string) => call<{ project: Project }>(`/projects/${id}/grade`, post({ hook })).then((r) => r.project),
  voiceOptions: (projectId?: string) => call<VoiceOptions>(`/voice/options${projectId ? `?projectId=${projectId}` : ""}`),
  createVoice: (id: string, body: { language: string; model: string; voice: string; styles: string[] }) =>
    call<{ voice: NonNullable<Project["voice"]> }>(`/projects/${id}/voice`, post(body)).then((r) => r.voice),
  rateTake: (id: string, takeId: string, stars: number) =>
    call<{ project: Project }>(`/projects/${id}/voice/takes/${takeId}/rating`, post({ stars })).then((r) => r.project),
};

const isRunning = (data: { status: string }) => data.status === "running";

/**
 * Loads a document and keeps refreshing it while the server says it is still working.
 * `load` and `isWorking` must be stable references.
 */
export function useLive<T extends { status: string }>(load: () => Promise<T>, isWorking: (data: T) => boolean = isRunning) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await load();
      setData(next);
      setError("");
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
      if (!stopped && !next) timer = setTimeout(first, 5000);
    };
    void first();
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);

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

/** The newest style that can write a script now, else the newest one. */
export const readyFirst = <T extends { status: string }>(list: T[]) => list.find((p) => p.status === "ready") ?? list[0];

export const clock = (sec: number | null | undefined) => {
  if (sec == null) return "";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export const host = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};

export const compact = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("th-TH", { notation: "compact", maximumFractionDigits: 1 }).format(n);
