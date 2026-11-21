"use client";

import { AlertCircle, Clapperboard, Download, LoaderCircle } from "lucide-react";
import type { CSSProperties, Ref } from "react";
import { useLanguage } from "@/components/language-provider";

export type DirectorClip = { id: string; url: string; name: string; aiVoice?: boolean; projectId?: string };

/**
 * The end of the page when our AI director makes the video: the one button, the wait, a failure with retry,
 * then the clip with download and the editor. Same surfaces as CreateBar so both engines look alike.
 */
export function DirectorBar({ running, clip, problem, reason, onStart, onReset, onEdit, dockRef }: {
  running: boolean; clip: DirectorClip | null; problem: string; reason: string;
  onStart: () => void; onReset: () => void; onEdit: () => void; dockRef: Ref<HTMLDivElement>;
}) {
  const { t } = useLanguage();
  if (clip) {
    return <div className="vs-dock" data-state="ready" ref={dockRef}>
      <section className="vs-result" data-shape="tall" style={{ "--ar": 9 / 16 } as CSSProperties} aria-label={t("คลิปพร้อมแล้ว")}>
        <video controls playsInline preload="metadata" src={clip.url} aria-label={t("พรีวิววิดีโอ")} />
        <div className="vs-result-side">
          <h2>{t("คลิปพร้อมแล้ว")}</h2>
          {clip.aiVoice && <p>{t("เสียงบรรยายสร้างด้วย AI")}</p>}
          <a className="vs-go" href={clip.url} download={clip.name}><Download size={18} aria-hidden />{t("ดาวน์โหลด")}</a>
          <button type="button" className="vs-go" onClick={onEdit}><Clapperboard size={18} aria-hidden />{t("เปิดในห้องตัดต่อ")}</button>
          <button type="button" className="vs-link" onClick={onReset}>{t("สร้างใหม่")}</button>
        </div>
      </section>
    </div>;
  }
  if (running) {
    return <div className="vs-dock" data-state="running" ref={dockRef}>
      <div className="vs-bar" role="status" aria-live="polite">
        <div className="vs-bar-progress">
          <div className="vs-bar-line"><span><LoaderCircle className="animate-spin" size={16} aria-hidden />{t("ผู้กำกับ AI กำลังวางช็อตและเรนเดอร์")}</span></div>
          <span className="vs-hint">{t("ใช้เวลาประมาณ 1–5 นาที ปิดหน้านี้ได้เมื่อคลิปเสร็จ")}</span>
        </div>
      </div>
    </div>;
  }
  if (problem) {
    return <div className="vs-dock" data-state="error" ref={dockRef}>
      <div className="vs-bar" data-tone="error" role="alert">
        <AlertCircle size={20} aria-hidden />
        <p className="vs-bar-text">{t(problem)}</p>
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
