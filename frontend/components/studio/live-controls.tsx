"use client";

import { useEffect, useState } from "react";
import { Radio, Monitor, Tag } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { playOverlay, studioPost, studioRequest } from "./studio-api";

export function LiveControls({ overlayOrigin }: { overlayOrigin: string }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [sku, setSku] = useState("A1");
  const [price, setPrice] = useState("299");
  const [style, setStyle] = useState("tag");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState<number | null>(null);
  const [rendering, setRendering] = useState(false);
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
  }, [url]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try { await action(); }
    catch (error) { setStatus(error instanceof Error ? error.message : t("ลองอีกครั้ง")); }
    finally { setBusy(false); }
  }
  return <section className="live-controls">
    <h2><Radio />{t("ควบคุมไลฟ์")}</h2>
    <div className="live-grid">
      <section><h3><Monitor />OBS Browser Source</h3>
        <p role="status">{t(connected === null ? "ยังไม่ทราบสถานะการเชื่อมต่อ" : connected > 0 ? "เชื่อมต่อ overlay แล้ว" : "กำลังรอ Browser Source เชื่อมต่อ")}{connected ? ` (${connected})` : ""}</p>
        <p>{t("คัดลอก URL ไปวางใน Browser Source ขนาด 1920 × 1080")}</p>
        <button type="button" className="studio-small-button" disabled={busy} onClick={() => void act(async () => {
          const link = await studioPost<{ path: string }>("/agent/overlay/link", {});
          setConnected(0);
          setUrl(new URL(link.path, overlayOrigin).href);
        })}>{t("สร้างลิงก์ OBS ใหม่ (แทนลิงก์เดิม)")}</button>
        {url && <input aria-label="OBS URL" readOnly value={url} onFocus={(e) => e.target.select()} />}
      </section>
      <form onSubmit={(e) => { e.preventDefault(); void act(async () => {
        const result = await playOverlay({ type: "price", sku, price: Number(price), style });
        setStatus(t(result.delivered ? "ส่งไปยังหน้าจอที่เชื่อมต่อแล้ว" : "ยังไม่มีหน้าจอเชื่อมต่อ เปิดลิงก์ใน OBS ก่อน"));
      }); }}>
        <h3><Tag />{t("ป้ายราคา")}</h3>
        <div className="live-fields"><label>SKU<input required maxLength={80} value={sku} onChange={(e) => setSku(e.target.value)} /></label>
        <label>{t("ราคา (บาท)")}<input required type="number" min="0" max="999999999" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>{t("สไตล์ป้าย")}<select value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="tag">{t("ป้ายแขวน")}</option><option value="sticker">{t("สติกเกอร์ราคา")}</option>
          <option value="receipt">{t("ใบเสร็จ")}</option><option value="flap">{t("ป้ายพลิก")}</option>
        </select></label></div>
        <button type="submit" disabled={busy} className="studio-small-button">{t("ขึ้นป้ายราคาทันที")}</button>
        <button type="button" disabled={busy || rendering} className="studio-small-button" onClick={() => void act(async () => {
          await studioPost("/agent/overlay/motion", { type: "price", sku, price: Number(price) });
          setRendering(true);
          setStatus(t("กำลังออกแบบ motion ใหม่ จะขึ้นจอเองเมื่อเสร็จ"));
        })}>{t(rendering ? "กำลังเจน motion…" : "เจน motion ใหม่ (รอได้)")}</button>
      </form>
    </div>
    <p role="status">{status}</p>
  </section>;
}
