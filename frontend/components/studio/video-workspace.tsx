"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowUp, Box, Clapperboard, Download, Film, ImagePlus, Link2, LoaderCircle, Paperclip, Plus, Radio, WandSparkles, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { VideoStudio } from "./video/video-studio";
import { playOverlay, studioPost, studioRequest } from "./studio-api";

type Clip = { id: string; url: string; name: string };
const maxBytes = 8 * 1024 * 1024;
const examples = [
  { image: "cosmetic", label: "เปิดตัวสกินแคร์", brief: "สร้างวิดีโอเปิดตัวเซรั่ม ให้ขวดค่อย ๆ ปรากฏในแสงนุ่ม พร้อมข้อความ Glow Serum" },
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
 * The video studio is one flow with a single button at the end (see video/video-studio.tsx).
 * The live studio keeps the composer below, which builds transparent overlay graphics.
 */
export function VideoWorkspace({ live }: { live: boolean }) {
  return live ? <StudioWorkspace live /> : <VideoStudio />;
}

function StudioWorkspace({ live }: { live: boolean }) {
  const { t } = useLanguage();
  const picker = useRef<HTMLInputElement>(null);
  const skillPicker = useRef<HTMLInputElement>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  const [blender, setBlender] = useState(false);
  const [brief, setBrief] = useState("");
  const [photo, setPhoto] = useState<File>();
  const [referenceVideo, setReferenceVideo] = useState<File>();
  const [referenceUrl, setReferenceUrl] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [clip, setClip] = useState<Clip>();
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
    if (images.length + videos.length !== files.length || images.length > 1 || videos.length > 1)
      return setStatus(t("แนบรูป PNG ได้ 1 รูป และคลิป MP4 หรือ WebM ได้ 1 คลิป"));
    if (images[0]) setPhoto(images[0]);
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
    const [imageId, referenceFile] = await Promise.all([photo && upload(photo), referenceVideo && upload(referenceVideo)]);
    const result = await studioPost<{ files?: Clip[]; message: string }>("/agent/chat", {
      message: brief.trim() || t(live ? "สร้างกราฟิกไลฟ์จากไฟล์อ้างอิงนี้" : "สร้างวิดีโอจากไฟล์อ้างอิงนี้"),
      outputFormat: live ? "overlay" : "portrait", files: imageId ? [imageId] : [], referenceFile,
      referenceUrl: referenceUrl.trim() || undefined,
    });
    if (result.files?.[0]) setClip(result.files[0]);
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
          <span><strong>{t("ลากไฟล์มาวาง หรือเลือกไฟล์")}</strong><small>PNG, MP4, WebM · {t("สูงสุด 8 MiB ต่อไฟล์")}</small></span>
        </button>
        <input type="file" ref={picker} hidden multiple accept="image/png,video/mp4,video/webm" aria-label={t("เลือกไฟล์สื่อ")}
          onChange={(event) => { attach(Array.from(event.target.files || [])); event.target.value = ""; }} />
        {(photo || referenceVideo) && <div className="studio-attachments">{[photo, referenceVideo].map((file, index) => file && <button key={index} type="button" aria-label={t("เอาไฟล์ออก") + " " + file.name} onClick={() => index === 0 ? setPhoto(undefined) : setReferenceVideo(undefined)}><Paperclip size={15} />{file.name}<X size={14} /></button>)}</div>}
        <textarea aria-label={t("บรีฟวิดีโอ")} ref={prompt} value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={12000}
          placeholder={t(live ? "อยากให้ป้ายไลฟ์แสดงอะไร?" : "เล่าคลิปที่อยากเห็น…")} />
        {showLink && <label className="studio-url"><Link2 size={17} /><input type="url" autoFocus pattern="https://.+" placeholder="https://" aria-label={t("ลิงก์อ้างอิงสาธารณะ (ถ้ามี)")} value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} /><button type="button" aria-label={t("เอาลิงก์ออก")} onClick={() => { setShowLink(false); setReferenceUrl(""); }}><X size={16} /></button></label>}
        <div className="studio-toolbar">
          <button type="button" className="studio-tool" aria-expanded={showLink} onClick={() => setShowLink(true)}><Link2 size={17} />{t("แนบลิงก์")}</button>
          <button type="submit" className="studio-generate" disabled={!brief.trim() && !photo && !referenceVideo && !referenceUrl.trim()}>
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
    <p className="studio-status" role="status">{busy === "generate" ? t("กำลังสร้างวิดีโอ…") : status}</p>
    {clip && <section className="studio-result">
      <video controls playsInline src={clip.url} aria-label={t("พรีวิววิดีโอ")} />
      <div><h2>{t("คลิปพร้อมแล้ว")}</h2><a className="studio-small-button" href={clip.url} download={clip.name}><Download size={16} />{t("ดาวน์โหลด WebM")}</a>
      {live && <button type="button" className="studio-small-button" disabled={!!busy} onClick={() => void act("publish", async () => {
        const result = await playOverlay({ type: "clip", fileId: clip.id }); setStatus(t(result.delivered ? "ส่งไปยังหน้าจอที่เชื่อมต่อแล้ว" : "ยังไม่มีหน้าจอเชื่อมต่อ เปิดลิงก์ใน OBS ก่อน"));
      })}><Radio size={16} />{t("เล่นคลิปบน overlay")}</button>}</div>
    </section>}
    <section className="studio-examples">
      <div className="studio-section-head"><h2>{t("ลองเริ่มจากตัวอย่าง")}</h2></div>
      <div className="example-grid">{(live ? liveExamples : examples).map((item) =>
        <button type="button" key={item.image} className={`example-tile example-${item.image}`} disabled={!!busy} onClick={() => void act("example", async () => {
          setPhoto(await sampleFile(item.image, !live && item.image === "cosmetic" ? "/studio/daily-glow.jpg" : `/editor/${item.image}.svg`)); setBrief(t(item.brief)); requestAnimationFrame(() => prompt.current?.focus());
        })}><span className="example-image" aria-hidden /><span><small>{live ? <Radio size={14} /> : <Clapperboard size={14} />}{t("บรีฟตัวอย่าง")}</small><strong>{t(item.label)}</strong></span><ArrowUpRight size={18} /></button>)}</div>
    </section>
  </>;
}
