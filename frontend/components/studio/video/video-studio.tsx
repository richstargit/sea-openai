"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { type Aspect, DEFAULT_ASPECT, LENGTHS, recallAspect, rememberAspect, type VideoLength } from "./api";
import { AspectPicker } from "./aspect-picker";
import { CreateBar } from "./create-bar";
import { type Photo, PhotoComposer } from "./photo-composer";
import { type StyleState, StyleSection } from "./style-section";
import { useVideoJob } from "./use-video-job";
import { type VoiceChoice, VoiceRow, useVoiceOptions } from "./voice-row";
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

/**
 * The video studio as one flow, top to bottom: photo and idea, style, length, voice, then one button.
 * The script, hooks and research are made by the backend job and are never shown here.
 */
export function VideoStudio() {
  const { t } = useLanguage();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [brief, setBrief] = useState("");
  const [style, setStyle] = useState<StyleState>({ id: "", name: "", status: "loading" });
  const [length, setLength] = useState<VideoLength>(30);
  const [aspect, setAspect] = useState<Aspect>(DEFAULT_ASPECT);
  const [voice, setVoice] = useState<VoiceChoice>({ language: "en", voice: "marin" });
  const options = useVoiceOptions();

  // The last chosen shape comes back after the first paint, so the server and the browser render the same markup.
  useEffect(() => {
    queueMicrotask(() => { const saved = recallAspect(); if (saved) setAspect(saved); });
  }, []);
  const chooseAspect = useCallback((next: Aspect) => { setAspect(next); rememberAspect(next); }, []);
  const { job, problem, starting, start, reset } = useVideoJob();

  const working = starting || job?.status === "running";
  const reason = blocker(photos.length > 0 || brief.trim().length > 0, style);

  const go = useCallback(() => {
    if (reason || working) return;
    void start({
      profileId: style.id,
      brief: brief.trim(),
      images: photos.map((photo) => photo.url),
      durationSec: length,
      aspect,
      voice: { language: voice.language, voice: voice.voice, model: options?.defaults.model },
    });
  }, [reason, working, start, style.id, brief, photos, length, aspect, voice, options]);

  // When the video comes back, bring it into view without animation if the user asked for none.
  const dock = useRef<HTMLDivElement>(null);
  const before = useRef(job?.status);
  useEffect(() => {
    if (before.current === "running" && job?.status === "ready") {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      dock.current?.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "nearest" });
    }
    before.current = job?.status;
  }, [job?.status]);

  return <div className="vs">
    <div className="studio-intro vs-intro">
      <h1>{t("วันนี้อยากสร้างคลิปอะไร?")}</h1>
    </div>

    <PhotoComposer photos={photos} onPhotos={setPhotos} brief={brief} onBrief={setBrief} disabled={working} />

    <section className="vs-card" aria-label={t("ตั้งค่า")}>
      <div className="vs-row">
        <span className="vs-label">{t("สไตล์ที่ใช้")}</span>
        <StyleSection onState={setStyle} disabled={working} />
      </div>

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

      <VoiceRow value={voice} onChange={setVoice} options={options} disabled={working} />
    </section>

    <CreateBar job={job} starting={starting} problem={problem} reason={reason} onStart={go} onReset={reset} dockRef={dock} aspect={aspect} />
  </div>;
}
