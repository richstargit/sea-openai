"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { Obs } from "../live-controls";
import { playOverlay, studioPost } from "../studio-api";
import "./price-tag.css";

const STYLES = [
  ["tag", "ป้ายแขวน"],
  ["sticker", "สติกเกอร์ราคา"],
  ["receipt", "ใบเสร็จ"],
  ["flap", "ป้ายพลิก"],
] as const;

/**
 * The price tag of the live studio: send a tag to the connected overlay now, or ask for a new motion for it.
 * It is its own section so the seller has it at hand in every phase of the live page. Whether OBS is connected
 * is shown in the OBS row above, so this only reports what happened to the last action.
 */
export function PriceTag({ obs }: { obs: Obs }) {
  const { t } = useLanguage();
  const [sku, setSku] = useState("A1");
  const [price, setPrice] = useState("299");
  const [style, setStyle] = useState("tag");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try { await action(); }
    catch (error) { setStatus(error instanceof Error ? error.message : t("ลองอีกครั้ง")); }
    finally { setBusy(false); }
  }

  return <section className="vs-card pt" aria-labelledby="pt-title">
    <form className="pt-form" onSubmit={(event) => { event.preventDefault(); void act(async () => {
      const result = await playOverlay({ type: "price", sku, price: Number(price), style });
      setStatus(t(result.delivered ? "ส่งไปยังหน้าจอที่เชื่อมต่อแล้ว" : "ยังไม่มีหน้าจอเชื่อมต่อ เปิดลิงก์ใน OBS ก่อน"));
    }); }}>
      <h2 className="pt-title" id="pt-title">{t("ป้ายราคา")}</h2>
      <div className="pt-fields">
        <div className="vs-field">
          <label htmlFor="pt-sku">SKU</label>
          <input id="pt-sku" required maxLength={80} value={sku} onChange={(event) => setSku(event.target.value)} />
        </div>
        <div className="vs-field">
          <label htmlFor="pt-price">{t("ราคา (บาท)")}</label>
          <input id="pt-price" required type="number" inputMode="decimal" min="0" max="999999999" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
        </div>
        <div className="vs-field pt-style">
          <label htmlFor="pt-style">{t("สไตล์ป้าย")}</label>
          <select id="pt-style" className="vs-select" value={style} onChange={(event) => setStyle(event.target.value)}>
            {STYLES.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
        </div>
      </div>
      <div className="pt-actions">
        <button type="submit" className="pt-go" disabled={busy}>{t("ขึ้นป้ายราคาทันที")}</button>
        <button type="button" className="pt-quiet" disabled={busy || obs.rendering} onClick={() => void act(async () => {
          await studioPost("/agent/overlay/motion", { type: "price", sku, price: Number(price) });
          obs.setRendering(true);
          setStatus(t("กำลังออกแบบ motion ใหม่ จะขึ้นจอเองเมื่อเสร็จ"));
        })}>{t(obs.rendering ? "กำลังเจน motion…" : "เจน motion ใหม่ (รอได้)")}</button>
      </div>
      <p className="vs-hint pt-note">{t("motion ใหม่ใช้เวลาสักครู่ แล้วจะขึ้นจอเอง")}</p>
      <p className="vs-hint pt-status" role="status">{status}</p>
    </form>
  </section>;
}
