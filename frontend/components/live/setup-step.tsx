"use client";

import { useState, type CSSProperties } from "react";
import { ArrowRight, Camera, Check, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { type LineupItem, type LiveStyle, type TagStyle, director, productImage } from "@/lib/live-plan";
import { type SaleFormat, saleFormatOptions } from "@/lib/sale-formats";
import { baht, hideBroken } from "./catalog-step";
import type { StepProps } from "./live-studio";
import "../studio/video/video.css";
import "./steps.css";

const TONES = ["สนุก เป็นกันเอง", "หรูหรา นุ่มนวล", "ขายไว เร้าใจ", "ให้ความรู้"];
type Preset = { id: string; name: string; hint: string } & Pick<LiveStyle, "tone" | "accent" | "accent2" | "tagStyle" | "mood" | "font">;
const PRESETS: Preset[] = [
  { id: "fun", name: "สนุก เป็นกันเอง", hint: "คุยเหมือนเพื่อน สีสดอบอุ่น", tone: "สนุก เป็นกันเอง", accent: "#f2542d", accent2: "#1f8a70", tagStyle: "sticker", mood: "สนุก ป๊อป เด้งดึ๋ง", font: "Prompt" },
  { id: "premium", name: "พรีเมียม หรูหรา", hint: "นุ่มนวล ดูแพง โทนทอง", tone: "หรูหรา นุ่มนวล", accent: "#b8934a", accent2: "#2b2b2b", tagStyle: "tag", mood: "หรูหรา มินิมอล ช้า ๆ", font: "Kanit" },
  { id: "fast", name: "ขายไว ดีลแรง", hint: "เร้าใจ เน้นราคาและโปร", tone: "ขายไว เร้าใจ", accent: "#e11d2e", accent2: "#ffb400", tagStyle: "flap", mood: "แรง เร็ว เร้าใจ", font: "Kanit" },
  { id: "cute", name: "น่ารักสดใส", hint: "พาสเทล อ่อนหวาน", tone: "สนุก เป็นกันเอง", accent: "#ff6fa5", accent2: "#7a6cf0", tagStyle: "sticker", mood: "น่ารัก สดใส พาสเทล", font: "Prompt" },
  { id: "minimal", name: "มินิมอล", hint: "สะอาด เรียบ อ่านง่าย", tone: "ให้ความรู้", accent: "#2f2f2f", accent2: "#7d8a7a", tagStyle: "receipt", mood: "มินิมอล เรียบ สะอาด", font: "IBM Plex Sans Thai" },
];
const presetOn = (s: LiveStyle, p: Preset) => s.tone === p.tone && s.accent === p.accent && s.accent2 === p.accent2 && s.tagStyle === p.tagStyle;
export const TAG_STYLES: { id: TagStyle; label: string }[] = [
  { id: "tag", label: "ป้ายแขวน" },
  { id: "sticker", label: "สติกเกอร์" },
  { id: "receipt", label: "ใบเสร็จ" },
  { id: "flap", label: "ป้ายพลิก" },
];

/** Step 2: pick a look (one click or AI) and which products are in this live. No timing: the live follows the host. */
export function SetupStep({ plan, setPlan, products, next }: StepProps) {
  const { t } = useLanguage();
  const { style } = plan;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setStyle = (patch: Partial<LiveStyle>) => setPlan((p) => ({ ...p, style: { ...p.style, ...patch } }));
  const setItem = (id: string, patch: Partial<LineupItem>) =>
    setPlan((p) => ({ ...p, lineup: p.lineup.map((item) => item.productId === id ? { ...item, ...patch } : item) }));
  const chosen = (id: string) => plan.lineup.some((item) => item.productId === id);
  const toggle = (id: string) => setPlan((p) => ({
    ...p, lineup: chosen(id) ? p.lineup.filter((x) => x.productId !== id) : [...p.lineup, { productId: id, points: "" }],
  }));
  const allChosen = products.length > 0 && products.every((p) => chosen(p.id));
  const toggleAll = () => setPlan((p) => ({
    ...p, lineup: allChosen ? [] : [...p.lineup, ...products.filter((x) => !p.lineup.some((i) => i.productId === x.id)).map((x) => ({ productId: x.id, points: "" }))],
  }));
  const items = plan.lineup.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ item, product }] : [];
  });
  const aiFill = async () => {
    setBusy(true); setError("");
    try {
      const suggestion = await director.style(style.shop, products);
      setStyle({ tone: suggestion.tone, accent: suggestion.accent, accent2: suggestion.accent2, font: suggestion.font, mood: suggestion.mood, tagStyle: suggestion.tagStyle });
    } catch { setError(t("AI ช่วยกรอกไม่สำเร็จ ลองใหม่อีกครั้ง หรือเลือกสไตล์สำเร็จรูปด้านบน")); }
    finally { setBusy(false); }
  };
  const example = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 60);

  return <div className="vs ls">
    <header className="ls-head">
      <p className="ls-kicker">{t("ขั้นที่ 2 จาก 4")}</p>
      <h2>{t("สไตล์และสินค้าในไลฟ์")}</h2>
      <p>{t("เลือกสไตล์สำเร็จรูปแล้วกดต่อได้เลย ไม่ต้องพิมพ์อะไร ปรับทีหลังได้ตามใจ ตอนไลฟ์ระบบจะตามสิ่งที่คุณหยิบและพูดเอง")}</p>
    </header>

    <section className="vs-card" aria-labelledby="ls-style-title">
      <div className="ls-card-head">
        <div><h3 id="ls-style-title">{t("สไตล์ไลฟ์")}</h3><p>{t("เลือกแบบที่ใกล้เคียงร้านคุณที่สุด หรือให้ AI ดูสินค้าแล้วเลือกให้ (บันทึกอัตโนมัติ)")}</p></div>
        <button type="button" className="vs-btn" onClick={aiFill} disabled={busy || products.length === 0} aria-busy={busy}>
          <Sparkles size={16} aria-hidden />{busy ? t("AI กำลังคิด…") : t("ให้ AI ช่วยกรอก")}
        </button>
      </div>
      {error && <p className="vs-row ls-muted" role="alert">{error}</p>}

      <div className="vs-row">
        <ul className="ls-presets" aria-label={t("สไตล์สำเร็จรูป")}>
          {PRESETS.map((preset) => <li key={preset.id}>
            <button type="button" className="ls-preset" aria-pressed={presetOn(style, preset)} onClick={() => setStyle({ tone: preset.tone, accent: preset.accent, accent2: preset.accent2, tagStyle: preset.tagStyle, mood: preset.mood, font: preset.font })}>
              <span className="ls-preset-dots" aria-hidden><i style={{ background: preset.accent }} /><i style={{ background: preset.accent2 }} /></span>
              <b>{t(preset.name)}</b><small>{t(preset.hint)}</small>
            </button>
          </li>)}
        </ul>
      </div>

      <div className="vs-row ls-grid2">
        <div className="vs-field">
          <label htmlFor="ls-shop">{t("ชื่อร้าน")}</label>
          <input id="ls-shop" value={style.shop} maxLength={80} onChange={(e) => setStyle({ shop: e.target.value })} placeholder={t("เช่น ร้านน้องมะลิ")} aria-describedby="ls-shop-h" />
          <small id="ls-shop-h" className="ls-help">{t("แสดงบนจอไลฟ์และใช้ในบทพูด")}</small>
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
          <input id="ls-tone" value={style.tone} maxLength={120} onChange={(e) => setStyle({ tone: e.target.value })} placeholder={t("เช่น ใจดี พูดเหมือนพี่สาว ไม่กดดันให้ซื้อ")} aria-describedby="ls-tone-h" />
          <small id="ls-tone-h" className="ls-help">{t("AI ใช้เลือกคำพูดแนะนำให้ตรงกับคุณ")}</small>
        </div>
      </div>

      <div className="vs-row ls-grid2">
        <div className="vs-group">
          <span className="vs-label">{t("สีแบรนด์")}</span>
          <div className="ls-colors">
            <label className="ls-color"><input type="color" value={style.accent} onChange={(e) => setStyle({ accent: e.target.value })} /><span><b>{t("สีหลัก")}</b><code>{style.accent}</code></span></label>
            <label className="ls-color"><input type="color" value={style.accent2} onChange={(e) => setStyle({ accent2: e.target.value })} /><span><b>{t("สีรอง")}</b><code>{style.accent2}</code></span></label>
          </div>
          <small className="ls-help">{t("ใช้กับป้ายราคาและกราฟิกบนจอ")}</small>
        </div>
        <div className="vs-field">
          <label htmlFor="ls-font">{t("ฟอนต์ (ไม่บังคับ)")}</label>
          <input id="ls-font" value={style.font} maxLength={60} onChange={(e) => setStyle({ font: e.target.value })} placeholder="Prompt, Kanit, IBM Plex Sans Thai" aria-describedby="ls-font-h" />
          <small id="ls-font-h" className="ls-help">{t("เว้นว่างได้ ระบบเลือกให้")}</small>
        </div>
      </div>

      <div className="vs-row">
        <div className="vs-field">
          <label htmlFor="ls-mood">{t("อารมณ์ของ motion")}</label>
          <input id="ls-mood" value={style.mood} maxLength={120} onChange={(e) => setStyle({ mood: e.target.value })} placeholder={t("เช่น มินิมอล หรู")} aria-describedby="ls-mood-h" />
          <small id="ls-mood-h" className="ls-help">{t("ความรู้สึกของแอนิเมชันบนจอ เช่น สดใส ป๊อป หรือ นุ่มนวล")}</small>
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
        <div><h3 id="ls-lineup-title">{t("สินค้าในไลฟ์นี้")}</h3><p>{t("แตะเพื่อเลือกสินค้าที่จะขายในไลฟ์นี้ ไม่ต้องตั้งเวลา")}</p></div>
        <div className="ls-pick-tools">
          <span className="ls-muted" aria-live="polite">{items.length}/{products.length} {t("ชิ้นที่เลือก")}</span>
          {products.length > 0 && <button type="button" className="vs-btn" onClick={toggleAll}>{allChosen ? t("ไม่เลือกเลย") : t("เลือกทั้งหมด")}</button>}
        </div>
      </div>

      {products.length === 0
        ? <p className="vs-row ls-muted">{t("ยังไม่มีสินค้าในคลัง กลับไปขั้นที่ 1 เพื่อเพิ่มสินค้า")}</p>
        : <div className="vs-row"><ul className="ls-pick">
            {products.map((product) => <li key={product.id}>
              <button type="button" className="ls-pick-item" aria-pressed={chosen(product.id)} onClick={() => toggle(product.id)}>
                <span className="ls-pick-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <Camera size={22} aria-hidden />{product.images[0] && <img src={productImage(product.images[0])} alt="" {...hideBroken} />}
                </span>
                <span className="ls-pick-name">{product.name}</span>
                <span className="ls-price">{baht(product.price)}</span>
                <span className="ls-pick-check" aria-hidden><Check size={14} /></span>
              </button>
            </li>)}
          </ul></div>}

      {items.length > 0 && <div className="vs-row">
        <details className="ls-extra">
          <summary>{t("เพิ่มจุดเด่นเอง (ไม่บังคับ)")}</summary>
          <p className="ls-help">{t("ข้ามได้ AI อ่านรายละเอียดสินค้าอยู่แล้ว ใส่เฉพาะสิ่งที่อยากเน้นเป็นพิเศษ")}</p>
          {items.map(({ item, product }) => <div key={product.id} className="ls-extra-item">
            <h4>{product.name}</h4>
            <div className="vs-field">
              <label htmlFor={"ls-points-" + product.id}>{t("จุดขาย")}</label>
              <textarea id={"ls-points-" + product.id} className="ls-short" value={item.points} maxLength={1000}
                onChange={(e) => setItem(product.id, { points: e.target.value })}
                placeholder={product.description ? t("เช่น") + " " + example(product.description) : t("เช่น ซึมไว ไม่เหนียว ลด 50% เฉพาะในไลฟ์")} />
            </div>
            <div className="vs-field">
              <label htmlFor={"ls-format-" + product.id}>{t("รูปแบบการขาย")}</label>
              <select id={"ls-format-" + product.id} className="vs-select" value={item.saleFormat ?? ""}
                onChange={(e) => setItem(product.id, { saleFormat: (e.target.value || undefined) as SaleFormat | undefined })}>
                <option value="">{t("รูปแบบการขาย: อัตโนมัติ")}</option>
                {saleFormatOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
              </select>
            </div>
          </div>)}
        </details>
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
