"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ArrowRight, Camera, Check, CircleAlert, Film, LoaderCircle, Palette, Play, Radio, RefreshCw, Sparkles, Star, Trash2, WandSparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { clock } from "@/components/studio/script/api";
import { playOverlay, studioPost, studioRequest } from "@/components/studio/studio-api";
import { type CustomMotion, type LineupItem, type LiveProduct, type MotionKit, type PreviewClip, type Segment, director, fillMotion, productImage } from "@/lib/live-plan";
import { saleFormatOptions } from "@/lib/sale-formats";
import { baht, hideBroken } from "./catalog-step";
import { TAG_STYLES } from "./setup-step";
import type { StepProps } from "./live-studio";
import { MotionLibrary } from "./motion-library";
import { ProductShows } from "./product-shows";
import "../studio/video/video.css";
import "./steps.css";

const KIND: Record<Segment["kind"], string> = { intro: "เปิดไลฟ์", product: "ขายสินค้า", interlude: "ช่วงคั่น", outro: "ปิดไลฟ์" };
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
export function PrepareStep(props: StepProps) {
  const { plan, setPlan, products, next } = props;
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
  const { script, kit: rawKit, style } = plan;
  // a kit made only to hold custom motions has no reasoning or sting: treat it as "no kit" for the kit section
  const kit = rawKit && (rawKit.reasoning || rawKit.sting?.headline) ? rawKit : null;
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
        <div><h3 id="ls-script-title">{t("บทพูดของแต่ละสินค้า (AI)")}</h3><p>{t("ประโยคเปิด จุดที่ควรพูด และคำชวนซื้อของสินค้าแต่ละตัว ไม่มีลำดับ ไม่จับเวลา ตอนไลฟ์ AI ดึงบทของสินค้าที่คุณกำลังพูดถึงขึ้นมาเอง")}</p></div>
        <button type="button" className="vs-btn" disabled={scriptBusy || noLineup} onClick={() => void makeScript()}>
          {scriptBusy ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : script ? <RefreshCw size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
          {t(scriptBusy ? "กำลังเขียนสคริปต์…" : script ? "เขียนใหม่" : "ให้ AI เขียนสคริปต์")}
        </button>
      </div>
      <p className="ls-sr-status" role="status">{scriptBusy ? t("กำลังเขียนสคริปต์…") : ""}</p>
      {scriptError && <div className="vs-row"><div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(scriptError)}</p></div></div>}
      {script && script.segments?.length > 0 && <div className="vs-row">
        <h4 className="ls-script-title">{script.title}</h4>
        <ul className="ls-script">
          {script.segments.map((seg, i) => <li key={i} className="ls-segment ls-segment-untimed">
            <div className="ls-seg-body">
              <div className="ls-seg-top"><span className="vs-chip" data-kind={seg.kind}>{t(KIND[seg.kind] ?? seg.kind)}</span><h5>{seg.title}</h5></div>
              {seg.opening && <p className="ls-opening">“{seg.opening}”</p>}
              {(seg.talkingPoints ?? []).length > 0 && <ul className="ls-points">{seg.talkingPoints.map((point, n) => <li key={n}>{point}</li>)}</ul>}
              {seg.callToAction && <p className="ls-cta"><b>{t("ชวนซื้อ")}</b> {seg.callToAction}</p>}
            </div>
          </li>)}
        </ul>
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

    <MotionDesigner plan={plan} setPlan={setPlan} products={products} noLineup={noLineup} />
    <MotionLibrary {...props} />
    <ProductShows plan={plan} setPlan={setPlan} products={products} />

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

const DESIGN_MOMENTS: [CustomMotion["moment"], string][] = [
  ["intro", "เปิดไลฟ์"], ["productIn", "สินค้าขึ้นจอ"], ["price", "ราคา"], ["deal", "โปร"],
  ["callToAction", "ชวน CF"], ["transition", "เปลี่ยนสินค้า"], ["celebrate", "ฉลอง"], ["outro", "ปิดไลฟ์"],
];
const MOMENT_LABEL = Object.fromEntries(DESIGN_MOMENTS) as Record<CustomMotion["moment"], string>;
const PREVIEW_SRC = "/overlay/index.html?preview=1#" + "a".repeat(43);

/** Step 3 (d): the AI Motion Designer. One shared preview stage plays the selected motion, so 12+ cards stay light. */
function MotionDesigner({ plan, setPlan, products, noLineup }: Pick<StepProps, "plan" | "setPlan" | "products"> & { noLineup: boolean }) {
  const { t } = useLanguage();
  const [count, setCount] = useState(6);
  const [picked, setPicked] = useState<Set<CustomMotion["moment"]>>(() => new Set(DESIGN_MOMENTS.map(([m]) => m)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<{ id: string; n: number } | null>(null); // n bumps to replay
  const frame = useRef<HTMLIFrameElement>(null);
  const loaded = useRef(false);

  const custom = plan.kit?.custom ?? [];
  const first = plan.lineup.map((item) => products.find((p) => p.id === item.productId)).find(Boolean);
  const current = custom.find((m) => m.id === selected?.id);
  const theme = plan.kit?.theme.look;

  const send = () => {
    if (!current || !loaded.current) return;
    const layers = fillMotion(current, { name: first?.name ?? "สินค้าตัวอย่าง", price: first?.price ?? 199, code: first?.id ?? "A01", shop: plan.style.shop || "ร้านของคุณ" });
    frame.current?.contentWindow?.postMessage({ source: "snappromo-control", event: { type: "graphic", preset: "compose", data: { layers }, ...(theme ? { theme } : {}) } }, location.origin);
  };
  useEffect(send, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function design() {
    setBusy(true);
    setError("");
    try {
      const { motions } = await director.designMotions(plan, products, count, picked.size === DESIGN_MOMENTS.length ? undefined : [...picked]);
      if (!motions?.length) throw new Error("AI ยังไม่ได้ motion กลับมา ลองอีกครั้ง");
      setPlan((p) => {
        const old = p.kit?.custom ?? [];
        const ids = new Set(old.map((m) => m.id));
        const fresh = motions.map((m) => { let id = m.id, n = 2; while (ids.has(id)) id = m.id + "-" + n++; ids.add(id); return { ...m, id }; });
        const base: MotionKit = p.kit ?? {
          theme: { accent: p.style.accent, accent2: p.style.accent2, look: "paper", tagStyle: p.style.tagStyle },
          moments: { intro: "", productIn: "", price: "", deal: "", callToAction: "", transition: "", celebrate: "", deadAir: "", outro: "" },
          sting: { headline: "", kicker: "", entrance: "" }, reasoning: "",
        };
        return { ...p, kit: { ...base, custom: [...old, ...fresh] } };
      });
      setSelected({ id: motions[0].id, n: 0 });
    } catch (e) { setError(errorText(e, "ออกแบบ motion ไม่สำเร็จ")); }
    finally { setBusy(false); }
  }
  const patchKit = (fn: (kit: MotionKit) => MotionKit) => setPlan((p) => p.kit ? { ...p, kit: fn(p.kit) } : p);
  const makeMain = (m: CustomMotion) => patchKit((k) => ({ ...k, moments: { ...k.moments, [m.moment]: "custom:" + m.id } }));
  const remove = (m: CustomMotion) => {
    patchKit((k) => ({ ...k, custom: (k.custom ?? []).filter((c) => c.id !== m.id), moments: k.moments[m.moment] === "custom:" + m.id ? { ...k.moments, [m.moment]: "" } : k.moments }));
    if (selected?.id === m.id) setSelected(null);
  };
  const toggle = (m: CustomMotion["moment"]) => setPicked((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });

  return <section id="ai-motion-designer" tabIndex={-1} className="vs-card ls-md" aria-labelledby="ls-md-title" aria-busy={busy}>
    <div className="ls-card-head">
      <div><h3 id="ls-md-title">{t("ออกแบบ motion ใหม่ด้วย AI")}</h3><p>{t("ให้ AI ออกแบบกราฟิกหลายแบบต่อช่วงของไลฟ์ ใช้ชื่อ ราคา และโค้ดสินค้าจริงของร้านคุณ ห้องควบคุมจะเลือกใช้ให้ตรงจังหวะ")}</p></div>
    </div>
    <div className="vs-row ls-md-controls">
      <div className="vs-field">
        <span className="ls-field-label" id="ls-md-count">{t("จำนวนที่ให้ออกแบบ")}</span>
        <div className="vs-seg ls-md-count" role="radiogroup" aria-labelledby="ls-md-count">
          {[6, 9, 12].map((n) => <label key={n}><input type="radio" name="ls-md-count" checked={count === n} disabled={busy} onChange={() => setCount(n)} /><span>{n}</span></label>)}
        </div>
      </div>
      <fieldset className="vs-field">
        <legend className="ls-field-label">{t("ช่วงที่ต้องการ")}</legend>
        <div className="ls-md-chips">
          {DESIGN_MOMENTS.map(([m, label]) => <label key={m} className="ls-md-chip"><input type="checkbox" checked={picked.has(m)} disabled={busy} onChange={() => toggle(m)} /><span>{t(label)}</span></label>)}
        </div>
      </fieldset>
      <div className="vs-actions">
        <button type="button" className="vs-btn ls-md-go" disabled={busy || noLineup || picked.size === 0} onClick={() => void design()}>
          {busy ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : <WandSparkles size={16} aria-hidden />}
          {t(busy ? "กำลังออกแบบ motion…" : "ให้ AI ออกแบบ motion")}
        </button>
        {picked.size === 0 && <span className="vs-hint">{t("เลือกอย่างน้อย 1 ช่วง")}</span>}
        <span className="ls-sr-status" role="status">{busy ? t("กำลังออกแบบ motion…") : ""}</span>
      </div>
      {error && <div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(error)}</p></div>}
    </div>

    {custom.length === 0
      ? <div className="vs-row"><div className="ls-empty">
          <span className="ls-empty-icon" aria-hidden><WandSparkles size={22} /></span>
          <h4>{t("ยังไม่มี motion ที่ AI ออกแบบ")}</h4>
          <p className="ls-muted">{t("AI จะวาดป้ายและเอฟเฟกต์เป็นชั้น ๆ ให้แต่ละช่วงของไลฟ์ เช่น เปิดไลฟ์ ราคา โปร และชวนกด CF แล้วคุณดูตัวอย่างและเลือกแบบที่ใช่เป็นแบบหลักได้")}</p>
        </div></div>
      : <div className="vs-row ls-md-gallery">
          <div className="ls-md-stage" aria-live="polite">
            <div className="ls-md-screen">
              <iframe ref={frame} src={PREVIEW_SRC} title={t("ตัวอย่าง motion")} tabIndex={-1}
                onLoad={() => { loaded.current = true; send(); }} />
              {!current && <p>{t("เลือก motion เพื่อดูตัวอย่าง")}</p>}
            </div>
            {current && <p className="vs-hint">{current.name} · {t("ตัวอย่างใช้สินค้า")} {first?.name ?? t("ตัวอย่าง")}</p>}
          </div>
          {DESIGN_MOMENTS.filter(([m]) => custom.some((c) => c.moment === m)).map(([m, label]) => {
            const list = custom.filter((c) => c.moment === m);
            return <div key={m} className="ls-md-group">
              <h4>{t(label)} <span className="vs-chip">{list.length}</span></h4>
              <ul className="ls-md-cards">
                {list.map((motion) => {
                  const active = selected?.id === motion.id;
                  const main = plan.kit?.moments[motion.moment] === "custom:" + motion.id;
                  return <li key={motion.id} className="ls-md-card" data-active={active || undefined}>
                    <button type="button" className="ls-md-poster" aria-label={t("เล่นดู") + " " + motion.name}
                      style={{ "--a": plan.style.accent, "--b": plan.style.accent2 } as CSSProperties}
                      onClick={() => setSelected((s) => ({ id: motion.id, n: (s?.n ?? 0) + 1 }))}>
                      <Play size={22} aria-hidden /><span>{t(MOMENT_LABEL[motion.moment])}</span>
                    </button>
                    <div className="ls-md-body">
                      <h5>{motion.name}</h5>
                      <p>{motion.description}</p>
                      <div className="ls-md-meta"><span className="vs-chip">{t(MOMENT_LABEL[motion.moment])}</span><span className="vs-chip">{motion.seconds} {t("วินาที")}</span>{main && <span className="vs-chip" data-state="ready"><Check size={13} aria-hidden />{t("ใช้เป็นหลัก")}</span>}</div>
                      <div className="ls-md-actions">
                        <button type="button" className="vs-btn" onClick={() => setSelected((s) => ({ id: motion.id, n: (s?.n ?? 0) + 1 }))}><Play size={15} aria-hidden />{t("เล่นดู")}</button>
                        <button type="button" className="vs-btn" disabled={main} onClick={() => makeMain(motion)}><Star size={15} aria-hidden />{t(main ? "ใช้เป็นหลักอยู่" : "ใช้เป็นหลัก")}</button>
                        <button type="button" className="vs-btn ls-icon" data-tone="danger" aria-label={t("ลบ") + " " + motion.name} onClick={() => remove(motion)}><Trash2 size={15} aria-hidden /></button>
                      </div>
                    </div>
                  </li>;
                })}
              </ul>
            </div>;
          })}
        </div>}
  </section>;
}
