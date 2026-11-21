"use client";

import { AlertCircle, LoaderCircle, Mic, Radio, Square } from "lucide-react";
import type { CSSProperties } from "react";
import { useLanguage } from "@/components/language-provider";
import type { Show } from "./api";
import type { Listen } from "./live-panel";

/** The floating bar for the prepare phase: one button, the one reason it cannot work yet, progress and the failure with its retry. */
export function PrepareBar({ show, starting, problem, reason, onStart }: { show: Show | null; starting: boolean; problem: string; reason: string; onStart: () => void }) {
  const { t } = useLanguage();

  if (show?.status === "running" || starting) {
    const count = show?.stepCount ?? 0;
    const at = Math.max(1, show?.stepIndex ?? 1);
    return <div className="vs-dock" data-state="running">
      <div className="vs-bar" role="status" aria-live="polite">
        <div className="vs-bar-progress">
          <div className="vs-bar-line">
            <span><LoaderCircle className="animate-spin" size={16} aria-hidden />{t("กำลังเตรียมบทไลฟ์")}</span>
            {count > 0 && <span>{at} {t("จาก")} {count}</span>}
          </div>
          <div className="vs-track-bar"><i style={{ "--p": count > 0 ? Math.min(1, (at - 0.5) / count) : 0.08 } as CSSProperties} /></div>
          {problem && <span className="vs-hint">{t(problem)}</span>}
        </div>
      </div>
    </div>;
  }

  const message = show?.status === "error" ? show.error ?? "เตรียมบทไม่สำเร็จ" : problem;
  if (message) {
    return <div className="vs-dock" data-state="error">
      <div className="vs-bar" data-tone="error" role="alert">
        <AlertCircle size={20} aria-hidden />
        <p className="vs-bar-text">{t(message)}</p>
        <button type="button" className="vs-go" onClick={onStart} disabled={Boolean(reason)}>{t("ลองใหม่")}</button>
      </div>
    </div>;
  }

  return <div className="vs-dock" data-state="idle">
    <div className="vs-bar">
      <p className="vs-bar-text" role="status">{reason && t(reason)}</p>
      <button type="button" className="vs-go" disabled={Boolean(reason)} onClick={onStart}><Radio size={18} aria-hidden />{t("เตรียมบทไลฟ์")}</button>
    </div>
  </div>;
}

/** The floating bar for the live phase: start and stop, and before the first start the notice about the microphone. */
export function ListenBar({ listen, armed, onStart, onAgree, onCancel }: { listen: Listen; armed: boolean; onStart: () => void; onAgree: () => void; onCancel: () => void }) {
  const { t } = useLanguage();

  if (listen.error) {
    return <div className="vs-dock" data-state="error">
      <div className="vs-bar" data-tone="error" role="alert">
        <AlertCircle size={20} aria-hidden />
        <p className="vs-bar-text">{t(listen.error)}</p>
        <button type="button" className="vs-go" onClick={onStart}><Mic size={18} aria-hidden />{t("ลองใหม่")}</button>
      </div>
    </div>;
  }

  if (armed) {
    return <div className="vs-dock" data-state="consent">
      <div className="vs-bar ls-consent">
        <p className="vs-bar-text">{t("เบราว์เซอร์จะขอใช้ไมโครโฟน เสียงของคุณจะถูกส่งไปถอดเป็นข้อความระหว่างที่ฟังอยู่ และหยุดเมื่อคุณกดหยุดฟัง แนะนำให้ใช้หูฟัง")}</p>
        <div className="vs-actions">
          <button type="button" className="vs-link" onClick={onCancel}>{t("ยกเลิก")}</button>
          <button type="button" className="vs-go" onClick={onAgree}><Mic size={18} aria-hidden />{t("ตกลง เริ่มฟัง")}</button>
        </div>
      </div>
    </div>;
  }

  if (listen.busy) {
    return <div className="vs-dock" data-state="running">
      <div className="vs-bar" role="status">
        <p className="vs-bar-text"><LoaderCircle className="animate-spin" size={16} aria-hidden /> {t(listen.status === "stopping" ? "กำลังหยุด" : listen.status === "asking" ? "กรุณาอนุญาตไมโครโฟนในเบราว์เซอร์" : "กำลังเชื่อมต่อ")}</p>
        <button type="button" className="vs-go" disabled>{t("รอสักครู่")}</button>
      </div>
    </div>;
  }

  if (listen.listening) {
    return <div className="vs-dock" data-state="listening">
      <div className="vs-bar">
        <p className="vs-bar-text" role="status">{listen.hint ? t(listen.hint) : t("กำลังฟังอยู่ พูดต่อได้เลย")}</p>
        <button type="button" className="vs-go ls-stop" onClick={listen.stop}><Square size={16} aria-hidden />{t("หยุดฟัง")}</button>
      </div>
    </div>;
  }

  return <div className="vs-dock" data-state="idle">
    <div className="vs-bar">
      <p className="vs-bar-text" role="status">{t("พร้อมแล้ว กดเริ่มฟังแล้วพูดได้เลย")}</p>
      <button type="button" className="vs-go" onClick={onStart}><Mic size={18} aria-hidden />{t("เริ่มฟัง")}</button>
    </div>
  </div>;
}
