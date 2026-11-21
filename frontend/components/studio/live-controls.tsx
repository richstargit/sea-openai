"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleDashed, CircleHelp, Monitor } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { CopyButton } from "./live-script/copy-button";
import { studioPost, studioRequest } from "./studio-api";

export type Obs = {
  /** How many Browser Sources are connected, or null when the status could not be read. */
  connected: number | null;
  rendering: boolean;
  setRendering: (value: boolean) => void;
  /** Ask again now, for example right after a new link was made. */
  recheck: () => void;
};

/** Is OBS connected? Read every three seconds while the tab is visible. */
export function useObs(): Obs {
  const [connected, setConnected] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
  const [round, setRound] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (document.visibilityState === "visible") {
        try {
          const result = await studioRequest<{ connected: number; rendering: boolean }>("/agent/overlay/status", { signal: controller.signal, cache: "no-store" });
          if (!controller.signal.aborted) { setConnected(result.connected); setRendering(result.rendering); }
        } catch {
          if (!controller.signal.aborted) setConnected(null);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [round]);
  const recheck = useCallback(() => setRound((n) => n + 1), []);
  return { connected, rendering, setRendering, recheck };
}

function absolute(url: string, origin: string): string {
  try { return new URL(url, origin).href; } catch { return url; }
}

/** One link: the field is read only and selects itself, and the button copies it. */
function LinkField({ label, value, placeholder }: { label: string; value: string; placeholder: string }) {
  return <div className="vs-field ls-link-field">
    <label>{label}</label>
    <div className="vs-inline">
      <input readOnly value={value} placeholder={placeholder} onFocus={(e) => e.target.select()} />
      <CopyButton text={value} />
    </div>
  </div>;
}

/**
 * The OBS status as a slim row of chips that is also the button of a collapsed disclosure holding the links.
 * It opens by itself while nothing is connected (that is when the seller needs the links), and a click always wins.
 */
export function ObsPanel({ obs, overlayOrigin, prompterUrl }: { obs: Obs; overlayOrigin: string; prompterUrl: string | null }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? !(obs.connected && obs.connected > 0);

  const state = obs.connected === null ? "unknown" : obs.connected > 0 ? "ready" : "waiting";
  async function makeLink() {
    setBusy(true);
    setStatus("");
    try {
      const link = await studioPost<{ path: string }>("/agent/overlay/link", {});
      setUrl(new URL(link.path, overlayOrigin).href);
      obs.recheck();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("ลองอีกครั้ง"));
    } finally { setBusy(false); }
  }

  return <details className="vs-more ls-obs" open={open}>
    <summary onClick={(event) => { event.preventDefault(); setChosen(!open); }}>
      <Monitor size={17} aria-hidden />
      <span>OBS</span>
      <span className="ls-obs-chips" role="status">
        {state === "ready" && <span className="vs-chip" data-state="ready"><Check size={14} aria-hidden />{t("เชื่อมต่อแล้ว")}{obs.connected ? ` (${obs.connected})` : ""}</span>}
        {state === "waiting" && <span className="vs-chip" data-state="running"><CircleDashed size={14} aria-hidden />{t("รอ OBS เชื่อมต่อ")}</span>}
        {state === "unknown" && <span className="vs-chip"><CircleHelp size={14} aria-hidden />{t("ยังไม่ทราบสถานะ")}</span>}
        {obs.rendering && <span className="vs-chip" data-state="running">{t("กำลังเจนกราฟิก")}</span>}
      </span>
    </summary>
    <div className="ls-obs-body">
      <div className="vs-field ls-link-field">
        <label>{t("ลิงก์ overlay สำหรับ OBS")}</label>
        {url && <div className="vs-inline"><input aria-label="OBS URL" readOnly value={url} onFocus={(e) => e.target.select()} /><CopyButton text={url} /></div>}
        <div className="vs-actions">
          <button type="button" className="vs-btn" disabled={busy} onClick={() => void makeLink()}>{t(url ? "สร้างลิงก์ใหม่ (แทนลิงก์เดิม)" : "สร้างลิงก์ OBS (แทนลิงก์เดิม)")}</button>
        </div>
      </div>
      <LinkField label={t("ลิงก์บทแนะนำสำหรับ OBS")} value={prompterUrl ? absolute(prompterUrl, overlayOrigin) : ""} placeholder={t("จะขึ้นหลังสร้างบทไลฟ์เสร็จ")} />
      <p className="vs-hint">{t("ผู้ชมจะไม่เห็นบทแนะนำ จนกว่าคุณจะเปิด “แสดงบนสตรีม”")}</p>
      <p className="vs-hint">{t("วางลิงก์ใน Browser Source ขนาด 1920 × 1080")}</p>
      <p className="vs-hint" role="status">{status}</p>
    </div>
  </details>;
}
