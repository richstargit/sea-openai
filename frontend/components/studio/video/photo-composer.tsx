"use client";

import { ImagePlus, Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { shrinkImage } from "../script/api";

export type Photo = { id: string; name: string; url: string };

const MAX_PHOTOS = 4;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
const EXAMPLE = { src: "/studio/daily-glow.jpg", name: "daily-glow.jpg", brief: "Glow Serum เซรั่มบำรุงผิวหน้า" };

/**
 * The first step: photos and the idea, on the studio composer surface. Photos are shrunk in the browser
 * so the request stays small. Nothing else lives here, the page has one button and it is at the end.
 */
export function PhotoComposer({ photos, onPhotos, brief, onBrief, disabled }: {
  photos: Photo[]; onPhotos: (update: (current: Photo[]) => Photo[]) => void; brief: string; onBrief: (value: string) => void; disabled?: boolean;
}) {
  const { t } = useLanguage();
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [note, setNote] = useState("");

  async function attach(files: File[]) {
    if (!files.length || disabled) return;
    setNote("");
    const images = files.filter((file) => ACCEPTED.includes(file.type));
    const room = MAX_PHOTOS - photos.length;
    if (images.length !== files.length) setNote("ใช้ได้เฉพาะรูป PNG JPEG หรือ WebP");
    else if (images.length > room) setNote("แนบได้สูงสุด 4 รูป");
    try {
      const urls = await Promise.all(images.slice(0, Math.max(0, room)).map((file) => shrinkImage(file)));
      onPhotos((current) => [...current, ...urls.map((url, n) => ({ id: crypto.randomUUID(), name: images[n]?.name ?? "", url }))].slice(0, MAX_PHOTOS));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "อ่านรูปไม่ได้");
    }
  }

  async function loadExample() {
    if (disabled) return;
    setNote("");
    try {
      const blob = await (await fetch(EXAMPLE.src)).blob();
      const url = await shrinkImage(new File([blob], EXAMPLE.name, { type: blob.type || "image/jpeg" }));
      onPhotos(() => [{ id: crypto.randomUUID(), name: EXAMPLE.name, url }]);
      onBrief(t(EXAMPLE.brief));
    } catch (e) {
      setNote(e instanceof Error ? e.message : "ลองอีกครั้ง");
    }
  }

  return <form className={`studio-composer vs-composer ${dragging ? "is-dragging" : ""}`} aria-label={t("รูปและไอเดีย")} onSubmit={(event) => event.preventDefault()}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setDragging(true); } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={(event) => { event.preventDefault(); setDragging(false); void attach(Array.from(event.dataTransfer.files)); }}
    onPaste={(event) => { if (event.clipboardData.files.length) { event.preventDefault(); void attach(Array.from(event.clipboardData.files)); } }}>
    <fieldset disabled={disabled}>
      <input type="file" ref={picker} hidden multiple accept={ACCEPTED.join(",")} aria-label={t("เลือกรูป")}
        onChange={(event) => { void attach(Array.from(event.target.files ?? [])); event.target.value = ""; }} />

      {photos.length === 0
        ? <button className="studio-drop" type="button" onClick={() => picker.current?.click()}>
            <span className="drop-icon"><ImagePlus size={30} strokeWidth={1.6} /></span>
            <span><strong>{t("ลากรูปมาวาง หรือเลือกรูป")}</strong><small>{t("สูงสุด 4 รูป")}</small></span>
          </button>
        : <ul className="vs-photos">
            {photos.map((photo, n) => <li key={photo.id}>
              {/* a data URL made in the browser, not a remote image, so next/image has nothing to optimise */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`${t("รูป")} ${n + 1}`} />
              <button type="button" className="vs-photo-remove" aria-label={`${t("เอารูปออก")} ${n + 1}`} onClick={() => onPhotos((current) => current.filter((p) => p.id !== photo.id))}><X size={14} aria-hidden /></button>
            </li>)}
            {photos.length < MAX_PHOTOS && <li>
              <button type="button" className="vs-photo-add" aria-label={t("เพิ่มรูป")} onClick={() => picker.current?.click()}><Plus size={22} aria-hidden /></button>
            </li>}
          </ul>}

      <textarea className="vs-brief" aria-label={t("ไอเดียหรือข้อมูลสินค้า")} value={brief} onChange={(event) => onBrief(event.target.value)} maxLength={4000}
        placeholder={t("ไอเดียหรือข้อมูลสินค้า")} />

      <div className="vs-composer-foot">
        <span className="vs-hint" role="status">{note && t(note)}</span>
        <button type="button" className="vs-link" onClick={() => void loadExample()}>{t("ลองตัวอย่าง")}</button>
      </div>
    </fieldset>
  </form>;
}
