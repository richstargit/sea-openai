"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowUp, Box, Clapperboard, Download, Film, ImagePlus, Link2, LoaderCircle, Paperclip, Plus, Radio, WandSparkles, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { saleFormatOptions } from "@/lib/sale-formats";
import { VideoStudio } from "./video/video-studio";
import { playOverlay, studioPost, studioRequest } from "./studio-api";

type Clip = { id: string; url: string; name: string; aiVoice?: boolean; projectId?:string; title?: string; sceneStarts?: number[] };
const maxBytes = 8 * 1024 * 1024;
const examples = [
  { image: "cosmetic", label: "เปิดตัวสกินแคร์", brief: "สร้างหนังเปิดตัว Daily Glow 6 ช็อต ใช้ภาพขวดจริง เจนภาพมาโครหยดเซรั่มกับภาพทาเซรั่มบนผิวในแสงเช้า ปิดด้วยภาพขวดและชื่อสินค้า พากย์สั้น ๆ ว่า เดลี่โกลว์ เริ่มเช้าวันใหม่ของคุณ" },
  { image: "chili", label: "โปรโมตสินค้า", brief: "สร้างวิดีโอโปรโมตน้ำพริก ใช้สีแดงเข้มและจังหวะสนุก พร้อมข้อความ เผ็ดเต็มคำ" },
];
const liveExamples = [
  { image: "cosmetic", label: "ป้ายราคาสินค้า", brief: "สร้างป้ายไลฟ์โปร่งใสสำหรับเซรั่ม ราคา 299 บาท ให้ตัวเลขเลื่อนเข้าด้านข้าง" },
  { image: "chili", label: "ป้ายโปรโมชัน", brief: "สร้างกราฟิกไลฟ์โปร่งใสสำหรับน้ำพริก พร้อมข้อความ ซื้อ 2 แถม 1 และแสงกะพริบ" },
];

async function sampleFile(image: string, source: string) {
  const picture = new Image();
  picture.src = source;
  await picture.decode();
  const canvas = document.createElement("canvas");
  canvas.width = picture.naturalWidth;
  canvas.height = picture.naturalHeight;
  canvas.getContext("2d")!.drawImage(picture, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not load example image.")), "image/png"));
  return new File([blob], image + ".png", { type: "image/png" });
}

async function upload(file: File) {
  const result = await studioRequest<{ file: Clip }>("/agent/files?name=" + encodeURIComponent(file.name), {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
  });
  return result.file.id;
}

/**
 * The video studio opens on Yok's one-flow screen, driven by our AI director underneath (video/video-studio.tsx).
 * "ขั้นสูง" keeps the original composer: reference clips and links, SKILL.md styles, Blender, examples.
 * The live studio keeps the composer for overlay graphics.
 */
export function VideoWorkspace({ live, userId }: { live: boolean; userId: string }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"studio" | "advanced">("studio");
  if (live) return <StudioWorkspace live userId={userId} />;
  return <>
    <div className="studio-mode" role="tablist" aria-label={t("โหมดสร้างวิดีโอ")}>
      <button type="button" role="tab" aria-selected={mode === "studio"} onClick={() => setMode("studio")}><Clapperboard size={16} />{t("สร้างวิดีโอ")}</button>
      <button type="button" role="tab" aria-selected={mode === "advanced"} onClick={() => setMode("advanced")}><WandSparkles size={16} />{t("ขั้นสูง")}</button>
    </div>
    {mode === "studio" ? <VideoStudio userId={userId} /> : <StudioWorkspace live={false} userId={userId} />}
  </>;
}

function StudioWorkspace({ live, userId }: { live: boolean; userId: string }) {
  const { t } = useLanguage();
  const router = useRouter();
  const picker = useRef<HTMLInputElement>(null);
  const skillPicker = useRef<HTMLInputElement>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const [blender, setBlender] = useState(false);
  const [brief, setBrief] = useState("");
  const [saleFormat, setSaleFormat] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [referenceVideo, setReferenceVideo] = useState<File>();
  const [referenceUrl, setReferenceUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [clip, setClip] = useState<Clip>();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    studioRequest<{ blenderOnline: boolean }>("/agent/skills", { signal: controller.signal })
      .then((data) => setBlender(data.blenderOnline)).catch(() => {});
    return () => controller.abort();
  }, []);

  function attach(files: File[]) {
    if (!files.length || busy) return;
    if (files.some((file) => file.size > maxBytes)) return setStatus(t("แต่ละไฟล์มีขนาดได้สูงสุด 8 MiB"));
    const images = files.filter((file) => file.type === "image/png");
    const videos = files.filter((file) => ["video/mp4", "video/webm"].includes(file.type));
    if (images.length + videos.length !== files.length || (live ? images.length > 1 : photos.length + images.length > 4) || videos.length > 1)
      return setStatus(t(live ? "แนบรูป PNG ได้ 1 รูป และคลิป MP4 หรือ WebM ได้ 1 คลิป" : "แนบรูป PNG ได้สูงสุด 4 รูป และคลิปอ้างอิงได้ 1 คลิป"));
    if (images.length) setPhotos(live ? images : [...photos, ...images]);
    if (videos[0]) setReferenceVideo(videos[0]);
    setStatus("");
  }
  async function act(key: string, action: () => Promise<void>) {
    setBusy(key);
    setStatus("");
    try { await action(); }
    catch (error) { setStatus(error instanceof Error ? error.message : t("ลองอีกครั้ง")); }
    finally { setBusy(""); }
  }
  async function generate() {
    const [files, referenceFile] = await Promise.all([Promise.all(photos.map(upload)), referenceVideo && upload(referenceVideo)]);
    const result = await studioPost<{ files?: Clip[]; message: string; toolsUsed?: string[]; projectId?:string }>("/agent/chat", {
      message: brief.trim() || t(live ? "สร้างกราฟิกไลฟ์จากไฟล์อ้างอิงนี้" : "สร้างวิดีโอจากไฟล์อ้างอิงนี้"),
      projectId: editing ? clip?.projectId : undefined,
      outputFormat: live ? "overlay" : "portrait", files, referenceFile,
      ...(!live && saleFormat ? { saleFormat } : {}),
      referenceUrl: referenceUrl.trim() || undefined,
    });
    if (result.files?.[0]) setClip({ ...result.files[0], projectId:result.projectId, aiVoice: result.toolsUsed?.some(tool=>tool==="generate_speech" || tool==="video_voice") });
    setEditing(false);
    setStatus(result.files?.length ? t("คลิปพร้อมแล้ว") : result.message);
  }

  return <>
    <div className="studio-intro">
      <h1>{t(live ? "สร้างกราฟิกสำหรับไลฟ์" : "วันนี้อยากสร้างคลิปอะไร?")}</h1>
      <p>{t(live ? "ออกแบบป้ายโปร่งใส แล้วส่งขึ้นจอไลฟ์เมื่อพร้อม" : "เริ่มจากรูป คลิปอ้างอิง หรือไอเดียสั้น ๆ ของคุณ")}</p>
    </div>
    <form className={`studio-composer ${dragging ? "is-dragging" : ""}`} aria-label={t("บรีฟวิดีโอ")}
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); attach(Array.from(event.dataTransfer.files)); }}
      onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); attach(Array.from(event.clipboardData.files)); } }}
      onSubmit={(event) => { event.preventDefault(); if (!busy) void act("generate", generate); }}>
      <fieldset disabled={!!busy}>
        <button className="studio-drop" type="button" onClick={() => picker.current?.click()}>
          <span className="drop-icon"><ImagePlus size={30} strokeWidth={1.6} /></span>
          <span><strong>{t("ลากไฟล์มาวาง หรือเลือกไฟล์")}</strong><small>{live ? "PNG" : t("PNG สูงสุด 4 รูป")} · MP4, WebM · {t("สูงสุด 8 MiB ต่อไฟล์")}</small></span>
        </button>
        <input type="file" ref={picker} hidden multiple accept="image/png,video/mp4,video/webm" aria-label={t("เลือกไฟล์สื่อ")}
          onChange={(event) => { attach(Array.from(event.target.files || [])); event.target.value = ""; }} />
        {(photos.length > 0 || referenceVideo) && <div className="studio-attachments">
          {photos.map((file, i) => <button key={i} type="button" aria-label={t("เอาไฟล์ออก") + " " + file.name} onClick={() => setPhotos(photos.filter((_, index) => index !== i))}><Paperclip size={15} />{file.name}<X size={14} /></button>)}
          {referenceVideo && <button type="button" aria-label={t("เอาไฟล์ออก") + " " + referenceVideo.name} onClick={() => setReferenceVideo(undefined)}><Paperclip size={15} />{referenceVideo.name}<X size={14} /></button>}
        </div>}
        <textarea aria-label={t("บรีฟวิดีโอ")} ref={prompt} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={12000}
          placeholder={t(live ? "อยากให้ป้ายไลฟ์แสดงอะไร?" : "เล่าคลิปที่อยากเห็น…")} />
        {showLink && <label className="studio-url"><Link2 size={17} /><input type="url" autoFocus pattern="https://.+" placeholder="https://" aria-label={t("ลิงก์อ้างอิงสาธารณะ (ถ้ามี)")} value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} /><button type="button" aria-label={t("เอาลิงก์ออก")} onClick={() => { setShowLink(false); setReferenceUrl(""); }}><X size={16} /></button></label>}
        <div className="studio-toolbar">
          <button type="button" className="studio-tool" aria-expanded={showLink} onClick={() => setShowLink(true)}><Link2 size={17} />{t("แนบลิงก์")}</button>
          {!live && <select className="studio-tool" aria-label={t("รูปแบบการขาย")} value={saleFormat} onChange={(e) => setSaleFormat(e.target.value)}>
            <option value="">{t("รูปแบบการขาย: อัตโนมัติ")}</option>
            {saleFormatOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>}
          <button type="submit" className="studio-generate" disabled={!brief.trim() && !photos.length && !referenceVideo && !referenceUrl.trim()}>
            {busy === "generate" ? <LoaderCircle className="animate-spin" size={17} /> : <ArrowUp size={17} />}
            {t(busy === "generate" ? "กำลังสร้างวิดีโอ…" : live ? "สร้างกราฟิก" : "สร้างวิดีโอ")}
          </button>
        </div>
      </fieldset>
    </form>
    <div className="studio-options">
      <details><summary><WandSparkles size={15} />{t("สกิลและสไตล์")}</summary>
        <div><p>{t("เอเจนต์เลือกสกิลตามบรีฟ เพิ่มสไตล์ของคุณได้ด้วยไฟล์ SKILL.md")}</p>
          <button type="button" className="studio-small-button" onClick={() => skillPicker.current?.click()} disabled={!!busy}><Plus size={16} />{t("เพิ่มสกิลส่วนตัว")}</button>
          <input type="file" hidden ref={skillPicker} accept=".md,text/markdown" onChange={(event) => {
            const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
            void act("skill", async () => { const saved = await studioPost<{ name: string }>("/agent/skills", { markdown: await file.text() }); setStatus(t("เพิ่มสกิลแล้ว") + " · " + saved.name); });
          }} />
          <p><Box size={14} />{t(blender ? "Blender พร้อมเรนเดอร์บนเครื่อง" : "เปิด Blender บนเครื่องเมื่อต้องการเรนเดอร์ 3D")}</p>
        </div>
      </details>
      <span>{live ? <Radio size={15} /> : <Film size={15} />}{live ? t("พื้นหลังโปร่งใส") : "9 : 16"}</span>
    </div>
    {editing && <button type="button" className="studio-small-button" disabled={!!busy} onClick={()=>setEditing(false)}>{t("ยกเลิกการแก้คลิป")}</button>}
    <p className="studio-status" role="status">{busy === "generate" ? t("กำลังสร้างวิดีโอ…") : status}</p>
    {clip && <section className="studio-result">
      <video controls playsInline src={clip.url} aria-label={t("พรีวิววิดีโอ")} />
      <div><h2>{t("คลิปพร้อมแล้ว")}</h2>{clip.aiVoice && <p>{t("เสียงบรรยายสร้างด้วย AI")}</p>}<a className="studio-small-button" href={clip.url} download={clip.name}><Download size={16} />{t("ดาวน์โหลด WebM")}</a>
      {!live && <button type="button" className="studio-small-button" disabled={!!busy} onClick={() => void act("edit", async () => {
        const { openStudioFilm } = await import("@/lib/editor/studio-film");
        const id = await openStudioFilm(userId, clip);
        router.push(`/editor?project=${id}`);
      })}><Clapperboard size={16} />{t("เปิดในห้องตัดต่อ")}</button>}
      {!live && clip.projectId && !editing && <button type="button" className="studio-small-button" disabled={!!busy} onClick={()=>{setEditing(true);setBrief("");prompt.current?.focus();}}>{t("แก้คลิปนี้")}</button>}
      {live && <button type="button" className="studio-small-button" disabled={!!busy} onClick={() => void act("publish", async () => {
        const result = await playOverlay({ type: "clip", fileId: clip.id }); setStatus(t(result.delivered ? "ส่งไปยังหน้าจอที่เชื่อมต่อแล้ว" : "ยังไม่มีหน้าจอเชื่อมต่อ เปิดลิงก์ใน OBS ก่อน"));
      })}><Radio size={16} />{t("เล่นคลิปบน overlay")}</button>}</div>
    </section>}
    <section className="studio-examples">
      <div className="studio-section-head"><h2>{t("ลองเริ่มจากตัวอย่าง")}</h2></div>
      <div className="example-grid">{(live ? liveExamples : examples).map((item) =>
        <button type="button" key={item.image} className={`example-tile example-${item.image}`} disabled={!!busy} onClick={() => void act("example", async () => {
          setPhotos([await sampleFile(item.image, !live && item.image === "cosmetic" ? "/studio/daily-glow.jpg" : `/editor/${item.image}.svg`)]); setBrief(t(item.brief)); requestAnimationFrame(() => prompt.current?.focus());
        })}><span className="example-image" aria-hidden /><span><small>{live ? <Radio size={14} /> : <Clapperboard size={14} />}{t("บรีฟตัวอย่าง")}</small><strong>{t(item.label)}</strong></span><ArrowUpRight size={18} /></button>)}</div>
    </section>
  </>;
}
