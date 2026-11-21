"use client";

import type { CSSProperties } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Camera, Plus, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { type LineupItem, type LiveStyle, type TagStyle, productImage } from "@/lib/live-plan";
import { type SaleFormat, saleFormatOptions } from "@/lib/sale-formats";
import { baht, hideBroken } from "./catalog-step";
import type { StepProps } from "./live-studio";
import "../studio/video/video.css";
import "./steps.css";

const TONES = ["สนุก เป็นกันเอง", "หรูหรา นุ่มนวล", "ขายไว เร้าใจ", "ให้ความรู้"];
export const TAG_STYLES: { id: TagStyle; label: string }[] = [
  { id: "tag", label: "ป้ายแขวน" },
  { id: "sticker", label: "สติกเกอร์" },
  { id: "receipt", label: "ใบเสร็จ" },
  { id: "flap", label: "ป้ายพลิก" },
];

/** Step 2: how the live looks and sounds, and which products go on in what order and for how long. */
export function SetupStep({ plan, setPlan, products, next }: StepProps) {
  const { t } = useLanguage();
  const { style } = plan;
  const setStyle = (patch: Partial<LiveStyle>) => setPlan((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const setItem = (id: string, patch: Partial<LineupItem>) =>
    setPlan((p) => ({ ...p, lineup: p.lineup.map((item) => item.productId === id ? { ...item, ...patch } : item) }));
  const move = (id: string, delta: number) => setPlan((p) => {
    const lineup = [...p.lineup];
    const from = lineup.findIndex((item) => item.productId === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= lineup.length) return p;
    [lineup[from], lineup[to]] = [lineup[to], lineup[from]];
    return { ...p, lineup };
  });
  const items = plan.lineup.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ item, product }] : [];
  });
  const pool = products.filter((p) => !plan.lineup.some((item) => item.productId === p.id));
  const total = items.reduce((sum, { item }) => sum + item.minutes, 0);

  return <div className="vs ls">
    <header className="ls-head">
      <p className="ls-kicker">{t("ขั้นที่ 2 จาก 4")}</p>
      <h2>{t("สไตล์และลำดับไลฟ์")}</h2>
      <p>{t("บอกบุคลิกของร้านและเลือกสินค้าที่จะขึ้นไลฟ์ ผู้กำกับ AI ใช้ข้อมูลนี้เขียนสคริปต์ ออกแบบ motion และกราฟิกบนจอ")}</p>
    </header>

    <section className="vs-card" aria-labelledby="ls-style-title">
      <div className="ls-card-head"><div><h3 id="ls-style-title">{t("สไตล์ไลฟ์")}</h3><p>{t("บันทึกอัตโนมัติ")}</p></div></div>

      <div className="vs-row ls-grid2">
        <div className="vs-field">
          <label htmlFor="ls-shop">{t("ชื่อร้าน")}</label>
          <input id="ls-shop" value={style.shop} maxLength={80} onChange={(e) => setStyle({ shop: e.target.value })} placeholder={t("เช่น ร้านน้องมะลิ")} />
        </div>
        <div className="vs-group" role="radiogroup" aria-labelledby="ls-lang-label">
          <span className="vs-label" id="ls-lang-label">{t("ภาษาที่ใช้ไลฟ์")}</span>
          <div className="vs-seg ls-seg2">
            {([["th", "ไทย"], ["en", "English"]] as const).map(([value, label]) => <label key={value}>
              <input type="radio" name="ls-lang" checked={style.language === value} onChange={() => setStyle({ language: value })} />
              <span>{t(label)}</span>
            </label>)}
          </div>
        </div>
      </div>

      <div className="vs-row">
        <span className="vs-label" id="ls-tone-label">{t("น้ำเสียงของแม่ค้า")}</span>
        <div className="ls-chips" role="group" aria-labelledby="ls-tone-label">
          {TONES.map((tone) => <button key={tone} type="button" className="ls-chip" aria-pressed={style.tone === tone} onClick={() => setStyle({ tone })}>{t(tone)}</button>)}
        </div>
        <div className="vs-field">
          <label htmlFor="ls-tone">{t("หรือเขียนเอง")}</label>
          <input id="ls-tone" value={style.tone} maxLength={120} onChange={(e) => setStyle({ tone: e.target.value })} />
        </div>
      </div>

      <div className="vs-row ls-grid2">
        <div className="vs-group">
          <span className="vs-label">{t("สีแบรนด์")}</span>
          <div className="ls-colors">
            <label className="ls-color"><input type="color" value={style.accent} onChange={(e) => setStyle({ accent: e.target.value })} /><span><b>{t("สีหลัก")}</b><code>{style.accent}</code></span></label>
            <label className="ls-color"><input type="color" value={style.accent2} onChange={(e) => setStyle({ accent2: e.target.value })} /><span><b>{t("สีรอง")}</b><code>{style.accent2}</code></span></label>
          </div>
        </div>
        <div className="vs-field">
          <label htmlFor="ls-font">{t("ฟอนต์ (ไม่บังคับ)")}</label>
          <input id="ls-font" value={style.font} maxLength={60} onChange={(e) => setStyle({ font: e.target.value })} placeholder="Prompt, Kanit, IBM Plex Sans Thai" />
        </div>
      </div>

      <div className="vs-row">
        <div className="vs-field">
          <label htmlFor="ls-mood">{t("อารมณ์ของ motion")}</label>
          <input id="ls-mood" value={style.mood} maxLength={120} onChange={(e) => setStyle({ mood: e.target.value })} placeholder={t("เช่น มินิมอล หรู")} />
        </div>
      </div>

      <div className="vs-row">
        <span className="vs-label" id="ls-tag-label">{t("แบบป้ายสินค้าบนจอ")}</span>
        <div className="vs-seg ls-tags" role="radiogroup" aria-labelledby="ls-tag-label" style={{ "--hint": style.accent, "--hint2": style.accent2 } as CSSProperties}>
          {TAG_STYLES.map((tag) => <label key={tag.id}>
            <input type="radio" name="ls-tag" checked={style.tagStyle === tag.id} onChange={() => setStyle({ tagStyle: tag.id })} />
            <span><i className={`ls-hint ls-hint-${tag.id}`} aria-hidden />{t(tag.label)}</span>
          </label>)}
        </div>
      </div>
    </section>

    <section className="vs-card" aria-labelledby="ls-lineup-title">
      <div className="ls-card-head">
        <div><h3 id="ls-lineup-title">{t("ลำดับสินค้าในไลฟ์")}</h3><p>{t("เรียงตามที่จะขายจริง ใส่เวลาและจุดขายของแต่ละชิ้น")}</p></div>
        <p className="ls-total" aria-live="polite"><span>{t("ความยาวรวม")}</span><strong>{Number(total.toFixed(1))}</strong> {t("นาที")}</p>
      </div>

      {items.length === 0
        ? <p className="vs-row ls-muted">{t("ยังไม่ได้เลือกสินค้า เพิ่มจากรายการด้านล่าง")}</p>
        : <ol className="ls-lineup">
            {items.map(({ item, product }, index) => <li key={product.id} className="ls-item">
              <span className="ls-item-num" aria-hidden>{index + 1}</span>
              <div className="ls-item-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <Camera size={20} aria-hidden />{product.images[0] && <img src={productImage(product.images[0])} alt="" {...hideBroken} />}
              </div>
              <div className="ls-item-body">
                <div className="ls-product-top"><h4>{product.name}</h4><span className="ls-price">{baht(product.price)}</span></div>
                <div className="ls-item-fields">
                  <div className="vs-field ls-minutes">
                    <label htmlFor={"ls-min-" + product.id}>{t("นาที")}</label>
                    <input id={"ls-min-" + product.id} type="number" min={0.5} max={60} step={0.5} value={item.minutes}
                      onChange={(e) => { const n = e.target.valueAsNumber; if (Number.isFinite(n)) setItem(product.id, { minutes: Math.min(60, Math.max(0.5, n)) }); }} />
                  </div>
                  <div className="vs-field">
                    <label htmlFor={"ls-format-" + product.id}>{t("รูปแบบการขาย")}</label>
                    <select id={"ls-format-" + product.id} className="vs-select" value={item.saleFormat ?? ""}
                      onChange={(e) => setItem(product.id, { saleFormat: (e.target.value || undefined) as SaleFormat | undefined })}>
                      <option value="">{t("รูปแบบการขาย: อัตโนมัติ")}</option>
                      {saleFormatOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
                    </select>
                  </div>
                </div>
                <div className="vs-field">
                  <label htmlFor={"ls-points-" + product.id}>{t("จุดขาย")}</label>
                  <textarea id={"ls-points-" + product.id} className="ls-short" value={item.points} maxLength={1000}
                    onChange={(e) => setItem(product.id, { points: e.target.value })} placeholder={t("เช่น ซึมไว ไม่เหนียว ลด 50% เฉพาะในไลฟ์")} />
                </div>
              </div>
              <div className="ls-item-tools">
                <button type="button" className="vs-btn ls-icon" aria-label={t("เลื่อนขึ้น") + " " + product.name} disabled={index === 0} onClick={() => move(product.id, -1)}><ArrowUp size={16} aria-hidden /></button>
                <button type="button" className="vs-btn ls-icon" aria-label={t("เลื่อนลง") + " " + product.name} disabled={index === items.length - 1} onClick={() => move(product.id, 1)}><ArrowDown size={16} aria-hidden /></button>
                <button type="button" className="vs-btn ls-icon" data-tone="danger" aria-label={t("เอาออกจากไลฟ์") + " " + product.name}
                  onClick={() => setPlan((p) => ({ ...p, lineup: p.lineup.filter((x) => x.productId !== product.id) }))}><X size={16} aria-hidden /></button>
              </div>
            </li>)}
          </ol>}

      {pool.length > 0 && <div className="vs-row">
        <span className="vs-label" id="ls-pool-label">{t("สินค้าที่ยังไม่ได้อยู่ในไลฟ์")}</span>
        <ul className="ls-pool" aria-labelledby="ls-pool-label">
          {pool.map((product) => <li key={product.id}>
            <button type="button" className="ls-pool-item" aria-label={t("เพิ่มเข้าไลฟ์") + " " + product.name} onClick={() => setPlan((p) => ({ ...p, lineup: [...p.lineup, { productId: product.id, minutes: 3, points: "" }] }))}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {product.images[0] ? <img src={productImage(product.images[0])} alt="" {...hideBroken} /> : <Camera size={16} aria-hidden />}
              <span>{product.name}</span><Plus size={16} aria-hidden />
            </button>
          </li>)}
        </ul>
      </div>}
    </section>

    <footer className="ls-foot">
      {items.length === 0 && <p>{t("เลือกสินค้าเข้าไลฟ์อย่างน้อย 1 ชิ้นก่อน")}</p>}
      <button type="button" className="vs-go" disabled={items.length === 0} onClick={next}>
        {t("ต่อไป: เตรียมคลิปและ motion")}<ArrowRight size={18} aria-hidden />
      </button>
    </footer>
  </div>;
}
