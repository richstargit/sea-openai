"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { ArrowRight, Camera, Check, CircleAlert, Film, LoaderCircle, Palette, Radio, RefreshCw, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { clock } from "@/components/studio/script/api";
import { playOverlay, studioPost, studioRequest } from "@/components/studio/studio-api";
import { type LineupItem, type LiveProduct, type MotionKit, type PreviewClip, type Segment, director, productImage } from "@/lib/live-plan";
import { saleFormatOptions } from "@/lib/sale-formats";
import { baht, hideBroken } from "./catalog-step";
import { TAG_STYLES } from "./setup-step";
import type { StepProps } from "./live-studio";
import "../studio/video/video.css";
import "./steps.css";

const KIND: Record<Segment["kind"], string> = { intro: "เปิดไลฟ์", product: "ขายสินค้า", interlude: "ช่วงคั่น", outro: "ปิดไลฟ์" };
const CUE: Record<string, string> = {
  product_card: "การ์ดสินค้า", price_pop: "ป้ายราคา", price_drop: "ราคาลด", free_badge: "ป้ายของแถม", low_stock: "ใกล้หมด",
  poll: "โหวต", fireworks: "พลุ", zoom: "ซูม", caption: "ข้อความบนจอ",
};
const LOOK: Record<MotionKit["theme"]["look"], string> = { paper: "กระดาษ อบอุ่น", ink: "หมึกเข้ม หรู", pop: "ป๊อป สดใส" };
const MOMENTS: [keyof MotionKit["moments"], string][] = [
  ["intro", "เปิดไลฟ์"], ["productIn", "สินค้าเข้าจอ"], ["price", "โชว์ราคา"], ["deal", "ดีลพิเศษ"], ["callToAction", "ชวนกดสั่ง"],
  ["transition", "เปลี่ยนช่วง"], ["celebrate", "ฉลองยอด"], ["deadAir", "ช่วงเงียบ"], ["outro", "ปิดไลฟ์"],
];
const HEX = /^#[0-9a-f]{6}$/i;
const GRAPHIC = "__graphic";
const errorText = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const without = <T,>(record: Record<string, T>, key: string) => { const copy = { ...record }; delete copy[key]; return copy; };

// Our video agent takes PNG files: redraw the catalog JPEG as PNG and upload it.
async function uploadPng(source: string, name: string) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("อ่านรูปไม่ได้")), "image/png"));
  const result = await studioRequest<{ file: { id: string } }>("/agent/files?name=" + encodeURIComponent(name), {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: png,
  });
  return result.file.id;
}

async function agentClip(body: object) {
  const result = await studioPost<{ files?: { id: string; url: string; name: string }[]; message: string }>("/agent/chat", body);
  const film = result.files?.[0];
  if (!film) throw new Error(result.message || "สร้างคลิปไม่สำเร็จ");
  return film;
}

/** Step 3: before going live, the director's script, the shop's motion kit and short clips that fill dead air. */
export function PrepareStep({ plan, setPlan, products, next }: StepProps) {
  const { t } = useLanguage();
  const [scriptBusy, setScriptBusy] = useState(false);
  const [scriptError, setScriptError] = useState("");
  const [kitBusy, setKitBusy] = useState(false);
  const [kitError, setKitError] = useState("");
  const [making, setMaking] = useState<Record<string, number>>({}); // product id (or GRAPHIC) → start time
  const [clipErrors, setClipErrors] = useState<Record<string, string>>({});
  const [clipStatus, setClipStatus] = useState("");
  const [graphicBrief, setGraphicBrief] = useState("");
  const [now, setNow] = useState(0);

  const busyCount = Object.keys(making).length;
  useEffect(() => {
    if (!busyCount) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busyCount]);

  const items = plan.lineup.flatMap((item) => {
    const product = products.find((p) => p.id === item.productId);
    return product ? [{ item, product }] : [];
  });
  const { script, kit, style } = plan;
  const lineupIds = new Set(items.map(({ product }) => product.id));
  const otherClips = plan.clips.filter((clip) => !lineupIds.has(clip.productId));

  async function makeScript() {
    setScriptBusy(true);
    setScriptError("");
    try { const next = await director.plan(plan, products); setPlan((p) => ({ ...p, script: next })); }
    catch (error) { setScriptError(errorText(error, "เขียนสคริปต์ไม่สำเร็จ")); }
    finally { setScriptBusy(false); }
  }
  async function makeKit() {
    setKitBusy(true);
    setKitError("");
    try { const next = await director.kit(plan, products); setPlan((p) => ({ ...p, kit: next })); }
    catch (error) { setKitError(errorText(error, "ออกแบบชุด motion ไม่สำเร็จ")); }
    finally { setKitBusy(false); }
  }

  async function run(key: string, task: () => Promise<PreviewClip>) {
    setNow(Date.now());
    setMaking((m) => ({ ...m, [key]: Date.now() }));
    setClipErrors((m) => without(m, key));
    try {
      const clip = await task();
      setPlan((p) => ({ ...p, clips: [...p.clips, clip] }));
      setClipStatus(t("คลิปพร้อมแล้ว") + " · " + clip.name);
    } catch (error) {
      setClipErrors((m) => ({ ...m, [key]: errorText(error, "สร้างคลิปไม่สำเร็จ") }));
    } finally {
      setMaking((m) => without(m, key));
    }
  }
  const productClip = (item: LineupItem, product: LiveProduct) => run(product.id, async () => {
    if (!product.images[0]) throw new Error("สินค้านี้ยังไม่มีรูปอ้างอิง");
    const fileId = await uploadPng(productImage(product.images[0]), product.id + ".png");
    const message = [
      `สินค้า: ${product.name}`,
      `ราคา ${product.price} บาท`,
      `รูปลักษณ์: ${product.description}`,
      item.points.trim() && `จุดขาย: ${item.points.trim()}`,
      style.shop.trim() && `ร้าน ${style.shop.trim()} น้ำเสียง ${style.tone}`,
      `สีแบรนด์ ${style.accent} และ ${style.accent2}`,
      "คลิปสั้น 10–15 วินาทีไว้เปิดระหว่างไลฟ์ตอนแม่ค้าพัก",
    ].filter(Boolean).join("\n");
    const film = await agentClip({ message, outputFormat: "portrait", files: [fileId], ...(item.saleFormat ? { saleFormat: item.saleFormat } : {}) });
    return { productId: product.id, fileId: film.id, url: film.url, name: film.name };
  });
  const graphicClip = () => {
    const brief = graphicBrief.trim();
    return run(GRAPHIC, async () => {
      const film = await agentClip({ message: `${brief}\nสีแบรนด์ ${style.accent} และ ${style.accent2}`, outputFormat: "overlay", files: [] });
      setGraphicBrief("");
      return { productId: "", fileId: film.id, url: film.url, name: brief.slice(0, 60) };
    });
  };
  const removeClip = (fileId: string) => setPlan((p) => ({ ...p, clips: p.clips.filter((c) => c.fileId !== fileId) }));
  async function play(fileId: string) {
    try {
      const result = await playOverlay({ type: "clip", fileId });
      setClipStatus(t(result.delivered ? "ส่งไปยังหน้าจอที่เชื่อมต่อแล้ว" : "ยังไม่มีหน้าจอเชื่อมต่อ เปิดลิงก์ใน OBS ก่อน"));
    } catch (error) {
      setClipStatus(t(errorText(error, "ส่งไป OBS ไม่สำเร็จ")));
    }
  }
  const elapsed = (key: string) => clock((now - (making[key] ?? now)) / 1000);

  const starts = (script?.segments ?? []).reduce<number[]>((acc, seg, i) => [...acc, i ? acc[i - 1] + (script!.segments[i - 1].seconds || 0) : 0], []);
  const kitColorsOk = !!kit && HEX.test(kit.theme.accent) && HEX.test(kit.theme.accent2);
  const kitColorsApplied = !!kit && kit.theme.accent.toLowerCase() === style.accent.toLowerCase() && kit.theme.accent2.toLowerCase() === style.accent2.toLowerCase();
  const noLineup = items.length === 0;

  return <div className="vs ls">
    <header className="ls-head">
      <p className="ls-kicker">{t("ขั้นที่ 3 จาก 4")}</p>
      <h2>{t("เตรียมคลิปและ motion")}</h2>
      <p>{t("ให้ AI เขียนสคริปต์ทั้งไลฟ์ ออกแบบ motion ประจำร้าน และทำคลิปสั้นไว้เปิดตอนแม่ค้าพัก ทุกอย่างถูกบันทึกไว้ใช้ในห้องควบคุม")}</p>
    </header>

    {noLineup && <div className="vs-notice" role="note">
      <span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span>
      <p>{t("ยังไม่ได้เลือกสินค้าเข้าไลฟ์ กลับไปขั้นที่ 2 เพื่อเลือกสินค้าก่อน")}</p>
    </div>}

    {/* (a) The director's script */}
    <section className="vs-card" aria-labelledby="ls-script-title" aria-busy={scriptBusy}>
      <div className="ls-card-head">
        <div><h3 id="ls-script-title">{t("สคริปต์ผู้กำกับ AI")}</h3><p>{t("ลำดับช่วงในไลฟ์ ประโยคเปิด ประเด็นที่ควรพูด และคิวกราฟิก")}</p></div>
        <button type="button" className="vs-btn" disabled={scriptBusy || noLineup} onClick={() => void makeScript()}>
          {scriptBusy ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : script ? <RefreshCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
          {t(scriptBusy ? "กำลังเขียนสคริปต์…" : script ? "เขียนใหม่" : "ให้ AI เขียนสคริปต์")}
        </button>
      </div>
      <p className="ls-sr-status" role="status">{scriptBusy ? t("กำลังเขียนสคริปต์…") : ""}</p>
      {scriptError && <div className="vs-row"><div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(scriptError)}</p></div></div>}
      {script && script.segments?.length > 0 && <div className="vs-row">
        <h4 className="ls-script-title">{script.title}</h4>
        <ol className="ls-script">
          {script.segments.map((seg, i) => <li key={i} className="ls-segment">
            <div className="ls-seg-time"><span>{clock(starts[i])}</span><small aria-label={t("ความยาว") + " " + clock(seg.seconds)}>{clock(seg.seconds)}</small></div>
            <div className="ls-seg-body">
              <div className="ls-seg-top"><span className="vs-chip" data-kind={seg.kind}>{t(KIND[seg.kind] ?? seg.kind)}</span><h5>{seg.title}</h5></div>
              {seg.opening && <p className="ls-opening">“{seg.opening}”</p>}
              {(seg.talkingPoints ?? []).length > 0 && <ul className="ls-points">{seg.talkingPoints.map((point, n) => <li key={n}>{point}</li>)}</ul>}
              {seg.callToAction && <p className="ls-cta"><b>{t("ชวนซื้อ")}</b> {seg.callToAction}</p>}
              {(seg.cues ?? []).length > 0 && <ul className="ls-cues" aria-label={t("คิวกราฟิก")}>
                {seg.cues.map((cue, n) => <li key={n} className="vs-chip" title={cue.note}>{clock(cue.at)} · {t(CUE[cue.event] ?? cue.event)}</li>)}
              </ul>}
            </div>
          </li>)}
        </ol>
      </div>}
    </section>

    {/* (b) The shop's motion kit */}
    <section className="vs-card" aria-labelledby="ls-kit-title" aria-busy={kitBusy}>
      <div className="ls-card-head">
        <div><h3 id="ls-kit-title">{t("ชุด motion ของร้าน (AI)")}</h3><p>{t("สี ลุค แบบป้าย และท่าเคลื่อนไหวของกราฟิกในแต่ละช่วงของไลฟ์")}</p></div>
        <button type="button" className="vs-btn" disabled={kitBusy || noLineup} onClick={() => void makeKit()}>
          {kitBusy ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : kit ? <RefreshCw size={16} aria-hidden /> : <WandSparkles size={16} aria-hidden />}
          {t(kitBusy ? "กำลังออกแบบ…" : kit ? "ออกแบบใหม่" : "ให้ AI ออกแบบ")}
        </button>
      </div>
      <p className="ls-sr-status" role="status">{kitBusy ? t("กำลังออกแบบ…") : ""}</p>
      {kitError && <div className="vs-row"><div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(kitError)}</p></div></div>}
      {kit && <div className="vs-row ls-kit">
        <div className="ls-kit-side">
          <div className="ls-palette">
            {[kit.theme.accent, kit.theme.accent2].map((color, n) => <div key={n} className="ls-swatch">
              <i style={{ background: color }} aria-hidden /><span>{t(n ? "สีรอง" : "สีหลัก")}</span><code>{color}</code>
            </div>)}
          </div>
          <dl className="ls-facts">
            <div><dt>{t("ลุค")}</dt><dd>{t(LOOK[kit.theme.look] ?? kit.theme.look)}</dd></div>
            <div><dt>{t("แบบป้าย")}</dt><dd>{t(TAG_STYLES.find((s) => s.id === kit.theme.tagStyle)?.label ?? kit.theme.tagStyle)}</dd></div>
          </dl>
          {kitColorsOk && <button type="button" className="vs-btn" disabled={kitColorsApplied}
            onClick={() => setPlan((p) => ({ ...p, style: { ...p.style, accent: kit.theme.accent, accent2: kit.theme.accent2 } }))}>
            {kitColorsApplied ? <Check size={16} aria-hidden /> : <Palette size={16} aria-hidden />}{t(kitColorsApplied ? "ใช้สีนี้อยู่" : "ใช้สีนี้")}
          </button>}
          {kit.sting && <div className="ls-sting" style={{ "--a": kit.theme.accent, "--b": kit.theme.accent2 } as CSSProperties}>
            <small>{kit.sting.kicker}</small><strong>{kit.sting.headline}</strong><span>{kit.sting.entrance}</span>
          </div>}
        </div>
        <div className="ls-kit-main">
          <table className="ls-moments">
            <caption>{t("ท่า motion ในแต่ละช่วง")}</caption>
            <thead><tr><th scope="col">{t("ช่วงในไลฟ์")}</th><th scope="col">{t("ท่าที่ใช้")}</th></tr></thead>
            <tbody>{MOMENTS.map(([key, label]) => <tr key={key}><th scope="row">{t(label)}</th><td>{kit.moments?.[key] ?? "–"}</td></tr>)}</tbody>
          </table>
          {kit.reasoning && <p className="vs-hint">{kit.reasoning}</p>}
        </div>
      </div>}
    </section>

    {/* (c) Dead-air clips and AI live graphics */}
    <section className="vs-card" aria-labelledby="ls-clips-title">
      <div className="ls-card-head">
        <div><h3 id="ls-clips-title">{t("คลิปกันช่วงตายไมค์")}</h3><p>{t("คลิปสั้นของสินค้าแต่ละชิ้น เปิดขึ้นจอตอนแม่ค้าพักหรือเตรียมของ ใช้เวลาสร้าง 1–5 นาที ทำหลายชิ้นพร้อมกันได้")}</p></div>
      </div>
      <p className="vs-row vs-hint ls-status" role="status">{clipStatus}</p>
      <ul className="ls-clip-rows">
        {items.map(({ item, product }) => {
          const busy = product.id in making;
          const clips = plan.clips.filter((c) => c.productId === product.id);
          return <li key={product.id} className="ls-clip-row" aria-busy={busy}>
            <div className="ls-clip-product">
              <div className="ls-item-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <Camera size={20} aria-hidden />{product.images[0] && <img src={productImage(product.images[0])} alt="" {...hideBroken} />}
              </div>
              <div className="ls-clip-name">
                <h4>{product.name}</h4>
                <span>{baht(product.price)}{item.saleFormat && " · " + t(saleFormatOptions.find(([v]) => v === item.saleFormat)?.[1] ?? "")}</span>
              </div>
              <button type="button" className="vs-btn" disabled={busy} onClick={() => void productClip(item, product)}>
                {busy ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Film size={16} aria-hidden />}
                {t(busy ? "กำลังสร้างคลิป…" : "สร้างคลิปพรีวิว")}
              </button>
            </div>
            {busy && <div className="ls-progress">
              <span role="status">{t("ผู้กำกับ AI กำลังทำคลิป ใช้เวลาประมาณ 1–5 นาที")}</span>
              <span className="ls-elapsed" aria-hidden>{elapsed(product.id)}</span>
              <span className="ls-bar" aria-hidden><i /></span>
            </div>}
            {clipErrors[product.id] && <div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(clipErrors[product.id])}</p></div>}
            {clips.length > 0 && <ul className="ls-clip-grid">
              {clips.map((clip) => <ClipTile key={clip.fileId} clip={clip} label={product.name} onPlay={() => void play(clip.fileId)} onRemove={() => removeClip(clip.fileId)} />)}
            </ul>}
          </li>;
        })}
      </ul>

      <form className="vs-row ls-graphic" aria-labelledby="ls-graphic-title" aria-busy={GRAPHIC in making}
        onSubmit={(event) => { event.preventDefault(); if (graphicBrief.trim() && !(GRAPHIC in making)) void graphicClip(); }}>
        <div><h4 id="ls-graphic-title">{t("กราฟิกไลฟ์จาก AI")}</h4><p className="vs-hint">{t("ป้ายหรือเอฟเฟกต์พื้นหลังโปร่งใส วางทับภาพกล้องใน OBS ได้ทันที (ไม่บังคับ)")}</p></div>
        <div className="vs-field">
          <label htmlFor="ls-graphic-brief">{t("อยากให้กราฟิกแสดงอะไร?")}</label>
          <textarea id="ls-graphic-brief" className="ls-short" value={graphicBrief} maxLength={2000} disabled={GRAPHIC in making}
            onChange={(e) => setGraphicBrief(e.target.value)} placeholder={t("เช่น ป้ายโปร ซื้อ 2 แถม 1 มีแสงวิ้งรอบตัวอักษร")} />
        </div>
        <div className="vs-actions">
          <button type="submit" className="vs-btn" disabled={!graphicBrief.trim() || GRAPHIC in making}>
            {GRAPHIC in making ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
            {t(GRAPHIC in making ? "กำลังสร้างกราฟิก…" : "สร้างกราฟิก")}
          </button>
          {GRAPHIC in making && <span className="vs-hint"><span role="status">{t("ใช้เวลาประมาณ 1–5 นาที")}</span> <span aria-hidden>{elapsed(GRAPHIC)}</span></span>}
        </div>
        {clipErrors[GRAPHIC] && <div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(clipErrors[GRAPHIC])}</p></div>}
        {otherClips.length > 0 && <ul className="ls-clip-grid">
          {otherClips.map((clip) => {
            const owner = products.find((p) => p.id === clip.productId);
            return <ClipTile key={clip.fileId} clip={clip} transparent={!clip.productId} label={owner?.name ?? (clip.name || t("กราฟิกไลฟ์"))}
              onPlay={() => void play(clip.fileId)} onRemove={() => removeClip(clip.fileId)} />;
          })}
        </ul>}
      </form>
    </section>

    <footer className="ls-foot">
      <ul className="ls-ready" aria-label={t("ความพร้อม")}>
        <li data-done={!!script || undefined}>{script ? <Check size={15} aria-hidden /> : <span aria-hidden className="ls-dot" />}{t("สคริปต์")}</li>
        <li data-done={!!kit || undefined}>{kit ? <Check size={15} aria-hidden /> : <span aria-hidden className="ls-dot" />}{t("ชุด motion")}</li>
        <li data-done={plan.clips.length > 0 || undefined}>{plan.clips.length > 0 ? <Check size={15} aria-hidden /> : <span aria-hidden className="ls-dot" />}{plan.clips.length} {t("คลิป")}</li>
      </ul>
      <button type="button" className="vs-go" onClick={next}>
        <Radio size={18} aria-hidden />{t("ไปห้องควบคุมไลฟ์")}<ArrowRight size={18} aria-hidden />
      </button>
    </footer>
  </div>;
}

function ClipTile({ clip, label, transparent, onPlay, onRemove }: { clip: PreviewClip; label: string; transparent?: boolean; onPlay: () => void; onRemove: () => void }) {
  const { t } = useLanguage();
  return <li className="ls-clip">
    <video className={transparent ? "ls-checker" : undefined} src={clip.url} controls playsInline preload="metadata" aria-label={t("พรีวิวคลิป") + " " + label} />
    <span className="ls-clip-label" title={label}>{label}</span>
    <div className="ls-clip-actions">
      <button type="button" className="vs-btn" onClick={onPlay}><Radio size={15} aria-hidden />{t("ทดสอบเล่นบน OBS")}</button>
      <button type="button" className="vs-btn ls-icon" data-tone="danger" aria-label={t("ลบคลิป") + " " + label} onClick={onRemove}><Trash2 size={15} aria-hidden /></button>
    </div>
  </li>;
}
