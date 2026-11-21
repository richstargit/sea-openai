"use client";

import { AlertCircle, Check, Clock, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import type { JobStatus } from "../script/types";

export const STATE_LABEL: Record<JobStatus, string> = {
  ready: "พร้อมใช้",
  running: "กำลังวิเคราะห์",
  draft: "ยังไม่ได้วิเคราะห์",
  error: "ต้องรันใหม่",
};

/** State as an icon, words and a tint, never colour alone. */
export function StateChip({ status }: { status: JobStatus }) {
  const { t } = useLanguage();
  const icon = status === "running" ? <LoaderCircle className="animate-spin" size={14} aria-hidden />
    : status === "ready" ? <Check size={14} aria-hidden />
    : status === "error" ? <AlertCircle size={14} aria-hidden />
    : <Clock size={14} aria-hidden />;
  return <span className="vs-chip" data-state={status}>{icon}{t(STATE_LABEL[status])}</span>;
}

/** A calm message: tint by tone, an icon and words, and the action inside it. */
export function Notice({ tone, action, children }: { tone: "error" | "ok" | "info"; action?: ReactNode; children: ReactNode }) {
  const icon = tone === "error" ? <AlertCircle size={18} /> : tone === "ok" ? <Check size={18} /> : <Clock size={18} />;
  return <div className="vs-notice" data-tone={tone} role={tone === "error" ? "alert" : "status"}>
    <span className="vs-notice-icon" aria-hidden>{icon}</span>
    <p>{children}</p>
    {action}
  </div>;
}

/** Display only: drops hashtags and a trailing ellipsis from a clip title. The full text stays in the title attribute. */
export function cleanTitle(raw: string): string {
  const cleaned = raw.replace(/\s*#[^\s#]+/gu, "").replace(/[….]{1,3}\s*$/u, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || raw;
}
