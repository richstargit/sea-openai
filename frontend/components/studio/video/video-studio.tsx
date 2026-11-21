"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { studioPost, studioRequest } from "../studio-api";
import { type DirectorClip, DirectorBar } from "./director-bar";
import { useLanguage } from "@/components/language-provider";
import { ASPECTS, type Aspect, DEFAULT_ASPECT, LENGTHS, recallAspect, rememberAspect, type VideoLength } from "./api";
import { AspectPicker } from "./aspect-picker";
import { CreateBar } from "./create-bar";
import { type Photo, PhotoComposer } from "./photo-composer";
import { type StyleState, StyleSection } from "./style-section";
import { useVideoJob } from "./use-video-job";
import { type SaleFormat, saleFormatOptions } from "@/lib/sale-formats";
import { LANGUAGE_NAME, type VoiceChoice, VoiceRow, useVoiceOptions } from "./voice-row";
import "./video.css";

/** The one reason the button cannot work yet, in order of what the user should do next. */
function blocker(hasInput: boolean, style: StyleState): string {
  if (!hasInput) return "ใส่รูปหรือไอเดียก่อน";
  if (style.status === "loading") return "กำลังโหลดสไตล์";
  if (style.status === "none") return "สร้างสไตล์ก่อน";
  if (style.status === "running") return "รอวิเคราะห์สไตล์เสร็จ";
  if (style.status !== "ready") return "สไตล์ยังไม่พร้อม";
  return "";
}

// Our backend takes PNG product photos; the composer keeps shrunk JPEG/WebP data URLs.
async function uploadPng(photo: Photo) {
  const image = new Image();
  image.src = photo.url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("อ่านรูปไม่ได้")), "image/png"));
  const name = (photo.name.replace(/\.[^.]+$/, "") || "photo") + ".png";
  const result = await studioRequest<{ file: { id: string } }>("/agent/files?name=" + encodeURIComponent(name), {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: png,
  });
  return result.file.id;
}

type Engine = "director" | "style";

/**
 * The video studio as one flow, top to bottom: photo and idea, how to make it, sale format, length, shape, voice,
 * then one button. By default our AI director (HyperFrames, sale formats, editor) makes the film; choosing
 * "a learned speaking style" hands the same inputs to Yok's script + voiceover job instead.
 */
export function VideoStudio({ userId }: { userId: string }) {
  const router = useRouter();
  const [engine, setEngine] = useState<Engine>("director");
  const [directing, setDirecting] = useState(false);
  const [clip, setClip] = useState<DirectorClip | null>(null);
  const [directorProblem, setDirectorProblem] = useState("");
  // set while the next brief should revise this film instead of starting a new one
  const [revising, setRevising] = useState<DirectorClip | null>(null);
  const { t } = useLanguage();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState<StyleState>({ id: "", name: "", status: "loading" });
  const [length, setLength] = useState<VideoLength>(30);
  const [aspect, setAspect] = useState<Aspect>(DEFAULT_ASPECT);
  const [saleFormat, setSaleFormat] = useState<SaleFormat | "">("");
  const [voice, setVoice] = useState<VoiceChoice>({ language: "en", voice: "marin" });
  const options = useVoiceOptions();

  // The last chosen shape comes back after the first paint, so the server and the browser render the same markup.
  useEffect(() => {
    queueMicrotask(() => { const saved = recallAspect(); if (saved) setAspect(saved); });
  }, []);
  const chooseAspect = useCallback((next: Aspect) => { setAspect(next); rememberAspect(next); }, []);
  const { job, problem, starting, start, reset } = useVideoJob();

  const working = starting || job?.status === "running" || directing;
  const hasInput = photos.length > 0 || brief.trim().length > 0;
  const reason = engine === "director" ? (revising ? (brief.trim() ? "" : "บอกสิ่งที่อยากแก้ในช่องไอเดีย") : hasInput ? "" : "ใส่รูปหรือไอเดียก่อน") : blocker(hasInput, style);

  // Our director: one request that plans, renders and returns the film. Length, shape and voice ride in the brief.
  const direct = useCallback(async () => {
    setDirecting(true);
    setDirectorProblem("");
    try {
      const files = await Promise.all(photos.map(uploadPng));
      const message = revising ? brief.trim() : [
        brief.trim() || "สร้างวิดีโอโปรโมตจากรูปสินค้านี้",
        `ความยาวประมาณ ${length} วินาที`,
        `สัดส่วนภาพ ${aspect}`,
        `เสียงพากย์ภาษา${LANGUAGE_NAME[voice.language] ?? voice.language}`,
      ].join("\n");
      const result = await studioPost<{ files?: DirectorClip[]; message: string; toolsUsed?: string[]; projectId?: string }>("/agent/chat", {
        message, outputFormat: "portrait", files, ...(saleFormat ? { saleFormat } : {}),
        ...(revising?.projectId ? { projectId: revising.projectId } : {}),
      });
      const film = result.files?.[0];
      if (!film) throw new Error(result.message);
      setClip({ ...film, projectId: result.projectId, aiVoice: result.toolsUsed?.some((tool) => tool === "generate_speech" || tool === "video_voice") });
      setRevising(null);
    } catch (error) {
      setDirectorProblem(error instanceof Error ? error.message : "สร้างวิดีโอไม่สำเร็จ");
    } finally {
      setDirecting(false);
    }
  }, [photos, brief, length, aspect, voice.language, saleFormat, revising]);

  const openEditor = useCallback(async () => {
    if (!clip) return;
    const { openStudioFilm } = await import("@/lib/editor/studio-film");
    const frame = ASPECTS.find((a) => a.id === aspect);
    const id = await openStudioFilm(userId, clip, frame && { width: frame.width, height: frame.height });
    router.push(`/editor?project=${id}`);
  }, [clip, aspect, userId, router]);

  const go = useCallback(() => {
    if (reason || working) return;
    if (engine === "director") return void direct();
    void start({
      profileId: style.id,
      brief: brief.trim(),
      images: photos.map((photo) => photo.url),
      durationSec: length,
      aspect,
      ...(saleFormat ? { saleFormat } : {}),
      voice: { language: voice.language, voice: voice.voice, model: options?.defaults.model },
    });
  }, [reason, working, engine, direct, start, style.id, brief, photos, length, aspect, saleFormat, voice, options]);

  // When the video comes back, bring it into view without animation if the user asked for none.
  const dock = useRef<HTMLDivElement>(null);
  const before = useRef(job?.status);
  useEffect(() => {
    if ((before.current === "running" && job?.status === "ready") || clip) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      dock.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "nearest" });
    }
    before.current = job?.status;
  }, [job?.status, clip]);

  return <div className="vs">
    <div className="studio-intro vs-intro">
      <h1>{t("วันนี้อยากสร้างคลิปอะไร?")}</h1>
    </div>

    <PhotoComposer photos={photos} onPhotos={setPhotos} brief={brief} onBrief={setBrief} disabled={working} />

    <section className="vs-card" aria-label={t("ตั้งค่า")}>
      <div className="vs-row">
        <span className="vs-label" id="vs-engine-label">{t("วิธีสร้าง")}</span>
        <div className="vs-seg" role="radiogroup" aria-labelledby="vs-engine-label">
          <label><input type="radio" name="vs-engine" checked={engine === "director"} disabled={working} onChange={() => setEngine("director")} /><span>{t("ผู้กำกับ AI")}</span></label>
          <label><input type="radio" name="vs-engine" checked={engine === "style"} disabled={working} onChange={() => setEngine("style")} /><span>{t("บทพูดจากสไตล์ที่เรียนรู้")}</span></label>
        </div>
      </div>

      {engine === "style" && <div className="vs-row">
        <span className="vs-label">{t("สไตล์ที่ใช้")}</span>
        <StyleSection onState={setStyle} disabled={working} />
      </div>}

      <div className="vs-row vs-pair">
        <div className="vs-group" role="radiogroup" aria-labelledby="vs-length-label">
          <span className="vs-label" id="vs-length-label">{t("ความยาว")}</span>
          <div className="vs-seg">
            {LENGTHS.map((s) => <label key={s}>
              <input type="radio" name="vs-length" value={s} checked={length === s} disabled={working} onChange={() => setLength(s)} />
              <span>{s} {t("วิ")}</span>
            </label>)}
          </div>
        </div>
        <AspectPicker value={aspect} onChange={chooseAspect} disabled={working} />
      </div>

      <div className="vs-row">
        <label className="vs-label" htmlFor="vs-sale-format">{t("รูปแบบการขาย")}</label>
        <select id="vs-sale-format" className="vs-select" value={saleFormat} disabled={working} onChange={(e) => setSaleFormat(e.target.value as SaleFormat | "")}>
          <option value="">{t("รูปแบบการขาย: อัตโนมัติ")}</option>
          {saleFormatOptions.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
        </select>
      </div>

      <VoiceRow value={voice} onChange={setVoice} options={options} disabled={working} />
    </section>

    {engine === "director"
      ? <DirectorBar running={directing} clip={clip} problem={directorProblem} reason={reason} revising={!!revising} onStart={go}
          onRevise={() => { setRevising(clip); setClip(null); setBrief(""); }} onCancelRevise={() => { setClip(revising); setRevising(null); }} onReset={() => { setClip(null); setDirectorProblem(""); }} onEdit={() => void openEditor().catch((e) => setDirectorProblem(e instanceof Error ? e.message : "เปิดห้องตัดต่อไม่ได้"))} dockRef={dock} />
      : <CreateBar job={job} starting={starting} problem={problem} reason={reason} onStart={go} onReset={reset} dockRef={dock} aspect={aspect} />}
  </div>;
}
