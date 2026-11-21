"use client";

import { AlertCircle, Download, LoaderCircle } from "lucide-react";
import type { CSSProperties, Ref } from "react";
import { useLanguage } from "@/components/language-provider";
import { ASPECTS, type Aspect, STEP_LABEL, STEPS, type VideoJob, videoFileUrl } from "./api";

/**
 * The end of the page and its only primary action. It is one place that changes with the job:
 * the button (with the one reason it cannot work yet), the progress, the failure with its retry, then the video.
 */
export function CreateBar({ job, starting, problem, reason, onStart, onReset, dockRef, aspect }: {
  job: VideoJob | null; starting: boolean; problem: string; reason: string; onStart: () => void; onReset: () => void; dockRef: Ref<HTMLDivElement>; aspect: Aspect;
}) {
  const { t } = useLanguage();

  if (job?.status === "ready") {
    // The finished job knows its own size. If an older job does not say, the shape that was chosen is the best guess.
    const chosen = ASPECTS.find((a) => a.id === (job.aspect ?? aspect)) ?? ASPECTS[0];
    const ratio = job.width && job.height ? job.width / job.height : (chosen ? chosen.w / chosen.h : 9 / 16);
    const shape = ratio > 1.2 ? "wide" : ratio > 0.95 ? "square" : "tall";
    return <div className="vs-dock" data-state="ready" ref={dockRef}>
      <section className="vs-result" data-shape={shape} style={{ "--ar": ratio } as CSSProperties} aria-label={t("คลิปพร้อมแล้ว")}>
        <video controls playsInline preload="metadata" src={videoFileUrl(job.id)} aria-label={t("พรีวิววิดีโอ")} />
        <div className="vs-result-side">
          <h2>{t("คลิปพร้อมแล้ว")}</h2>
          <a className="vs-go" href={videoFileUrl(job.id, true)} download><Download size={18} aria-hidden />{t("ดาวน์โหลด")}</a>
          <button type="button" className="vs-link" onClick={onReset}>{t("สร้างใหม่")}</button>
        </div>
      </section>
    </div>;
  }

  if (job?.status === "running" || starting) {
    const count = job?.stepCount ?? STEPS.length;
    const at = job?.step ? STEPS.indexOf(job.step) + 1 : Math.max(1, job?.stepIndex ?? 1);
    const label = job?.step ? STEP_LABEL[job.step] : "กำลังเริ่ม";
    return <div className="vs-dock" data-state="running" ref={dockRef}>
      <div className="vs-bar" role="status" aria-live="polite">
        <div className="vs-bar-progress">
          <div className="vs-bar-line">
            <span><LoaderCircle className="animate-spin" size={16} aria-hidden />{t(label)}</span>
            <span>{at} {t("จาก")} {count}</span>
          </div>
          <div className="vs-track-bar"><i style={{ "--p": Math.min(1, (at - 0.5) / count) } as CSSProperties} /></div>
          {problem && <span className="vs-hint">{t(problem)}</span>}
        </div>
      </div>
    </div>;
  }

  const message = job?.status === "error" ? job.error ?? "สร้างวิดีโอไม่สำเร็จ" : problem;
  if (message) {
    return <div className="vs-dock" data-state="error" ref={dockRef}>
      <div className="vs-bar" data-tone="error" role="alert">
        <AlertCircle size={20} aria-hidden />
        <p className="vs-bar-text">{t(message)}</p>
        <button type="button" className="vs-go" onClick={onStart} disabled={Boolean(reason)}>{t("ลองใหม่")}</button>
      </div>
    </div>;
  }

  return <div className="vs-dock" data-state="idle" ref={dockRef}>
    <div className="vs-bar">
      <p className="vs-bar-text" role="status">{reason && t(reason)}</p>
      <button type="button" className="vs-go" disabled={Boolean(reason)} onClick={onStart}>{t("สร้างวิดีโอ")}</button>
    </div>
  </div>;
}
