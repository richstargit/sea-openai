"use client";

import { useState } from "react";
import { Radio, Monitor, Tag } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { playOverlay, studioPost } from "./studio-api";

export function LiveControls({ overlayOrigin }: { overlayOrigin: string }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  const [sku, setSku] = useState("A1");
  const [price, setPrice] = useState("299");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
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
        <p>{t("คัดลอก URL ไปวางใน Browser Source ขนาด 1920 × 1080")}</p>
        <button type="button" className="studio-small-button" disabled={busy} onClick={() => void act(async () => {
          const link = await studioPost<{ path: string }>("/agent/overlay/link", {});
          setUrl(new URL(link.path, overlayOrigin).href);
        })}>{t("สร้างลิงก์ OBS ใหม่ (แทนลิงก์เดิม)")}</button>
        {url && <input aria-label="OBS URL" readOnly value={url} onFocus={(e) => e.target.select()} />}
      </section>
      <form onSubmit={(e) => { e.preventDefault(); void act(async () => {
        const result = await playOverlay({ type: "price", sku, price: Number(price) });
        setStatus(t(result.delivered ? "ส่งไปยังหน้าจอที่เชื่อมต่อแล้ว" : "ยังไม่มีหน้าจอเชื่อมต่อ เปิดลิงก์ใน OBS ก่อน"));
      }); }}>
        <h3><Tag />{t("ป้ายราคา")}</h3>
        <div className="live-fields"><label>SKU<input required maxLength={80} value={sku} onChange={(e) => setSku(e.target.value)} /></label>
        <label>{t("ราคา (บาท)")}<input required type="number" min="0" max="999999999" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></label></div>
        <button type="submit" disabled={busy} className="studio-small-button">{t("ทดสอบป้ายราคา")}</button>
      </form>
    </div>
    <p role="status">{status}</p>
  </section>;
}
