"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Film, Type, Music2 } from "lucide-react";
import { FPS, clipStart, framesOf, timecode, totalFrames, type Asset, type Clip, type Edit, type Project } from "@/lib/editor/model";
import { useLanguage } from "@/components/language-provider";

import { ClipFilmstrip } from "./clip-filmstrip";

type Props = { project: Project; assets: Asset[]; frame: number; selectedId?: string; zoom: number; onSeek: (frame: number) => void; onSelect: (id: string) => void; onEdit: (edit: Edit, merge?: string) => void };
export function Timeline({ project, assets, frame, selectedId, zoom, onSeek, onSelect, onEdit }: Props) {
  const { t } = useLanguage();
  const scroll = useRef<HTMLDivElement>(null);
  const dragged = useRef<string | null>(null);
  const [viewport, setViewport] = useState(760);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewport(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const frames = totalFrames(project);
  const px = (zoom / 50) * Math.max(1, viewport - 20) / Math.max(frames, FPS);
  const width = Math.max(viewport, frames * px + 20);
  const step = Math.max(1, Math.ceil(58 / (px * FPS)));
  function scrub(event: PointerEvent<HTMLElement>) {
    const element = event.currentTarget; element.setPointerCapture(event.pointerId);
    const bounds = element.getBoundingClientRect();
    const update = (clientX: number) => onSeek(Math.max(0, Math.min(Math.max(0, frames - 1), Math.round((clientX - bounds.left) / px))));
    update(event.clientX);
    element.onpointermove = (move) => update(move.clientX);
    element.onpointerup = element.onpointercancel = () => { element.onpointermove = null; element.onpointerup = null; element.onpointercancel = null; };
  }
  function trim(event: PointerEvent<HTMLSpanElement>, clip: Clip, edge: "in" | "out") {
    event.preventDefault(); event.stopPropagation();
    const element = event.currentTarget; element.setPointerCapture(event.pointerId);
    const startX = event.clientX, original = edge === "in" ? clip.sourceIn : clip.sourceOut;
    const asset = assets.find((item) => item.id === clip.assetId);
    if (!asset) return;
    const key = `trim-${clip.id}-${event.timeStamp}`;
    element.onpointermove = (move) => onEdit({ type: "trim", id: clip.id, edge, frame: original + Math.round((move.clientX - startX) / px * clip.speed), maxFrames: asset.frames }, key);
    element.onpointerup = element.onpointercancel = () => { element.onpointermove = null; element.onpointerup = null; element.onpointercancel = null; };
  }
  return (
    <div className="editor-timeline-wrap">
      <div className="editor-track-labels" aria-hidden><span /><span><Film size={16} /> {t("คลิป")}</span><span><Type size={16} /> {t("ข้อความ")}</span><span><Music2 size={16} /> {t("เพลง")}</span></div>
      <div ref={scroll} className="editor-timeline-scroll">
        <div className="editor-timeline-content" style={{ width }}>
          <div role="slider" tabIndex={0} aria-label={t("ตำแหน่งเล่น")} aria-valuemin={0} aria-valuemax={Math.max(0, frames - 1)} aria-valuenow={frame} aria-valuetext={timecode(frame)}
            onPointerDown={scrub} onKeyDown={(event) => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); event.stopPropagation(); onSeek(Math.max(0, Math.min(frames - 1, frame + (event.key === "ArrowRight" ? 1 : -1)))); } }} className="editor-ruler">
            {Array.from({ length: Math.ceil((width - 25) / (step * px * FPS)) }, (_, index) => <span key={index} style={{ left: index * step * px * FPS }}>{timecode(index * step * FPS).slice(0, 5)}</span>)}
          </div>
          <div className="editor-video-track">
            {project.clips.map((clip, index) => {
              const asset = assets.find((item) => item.id === clip.assetId);
              const start = clipStart(project, clip.id);
              const clipWidth = Math.max(4, framesOf(clip) * px - 3);
              return (
                <button key={clip.id} type="button" draggable data-testid="timeline-clip" aria-label={`${t("คลิป")} ${index + 1}: ${asset?.name || ""}`} aria-pressed={selectedId === clip.id}
                  onDragStart={() => { dragged.current = clip.id; }} onDragEnd={() => { dragged.current = null; }}
                  onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (dragged.current) onEdit({ type: "move", id: dragged.current, index }); dragged.current = null; }}
                  onClick={() => { onSelect(clip.id); onSeek(start); }} className={`editor-clip ${selectedId === clip.id ? "is-selected" : ""}`} style={{ left: start * px, width: clipWidth }}>
                  {asset && <ClipFilmstrip asset={asset} sourceIn={clip.sourceIn} sourceOut={clip.sourceOut} samples={Math.max(1, Math.min(8, Math.round(clipWidth / 90)))} />}
                  <span className="editor-clip-caption"><span className="editor-clip-name">{clip.title || asset?.name}</span><span className="editor-clip-duration">{(framesOf(clip) / FPS).toFixed(1)}s</span></span>
                  <span role="slider" tabIndex={selectedId === clip.id ? 0 : -1} aria-label={t("ตัดหัวคลิป")} aria-valuemin={0} aria-valuemax={clip.sourceOut - 1} aria-valuenow={clip.sourceIn}
                    onPointerDown={(event) => trim(event, clip, "in")} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key) && asset) { event.preventDefault(); event.stopPropagation(); onEdit({ type: "trim", id: clip.id, edge: "in", frame: clip.sourceIn + (event.key === "ArrowRight" ? 1 : -1), maxFrames: asset.frames }); } }} className="editor-trim-handle start" />
                  <span role="slider" tabIndex={selectedId === clip.id ? 0 : -1} aria-label={t("ตัดท้ายคลิป")} aria-valuemin={clip.sourceIn + 1} aria-valuemax={asset?.frames || clip.sourceOut} aria-valuenow={clip.sourceOut}
                    onPointerDown={(event) => trim(event, clip, "out")} onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight"].includes(event.key) && asset) { event.preventDefault(); event.stopPropagation(); onEdit({ type: "trim", id: clip.id, edge: "out", frame: clip.sourceOut + (event.key === "ArrowRight" ? 1 : -1), maxFrames: asset.frames }); } }} className="editor-trim-handle end" />
                </button>
              );
            })}
          </div>
          <div className="editor-text-track">{project.clips.map((clip) => <button key={clip.id} type="button" onClick={() => { onSelect(clip.id); onSeek(clipStart(project, clip.id)); }} className="editor-text-block" style={{ left: clipStart(project, clip.id) * px, width: Math.max(4, framesOf(clip) * px - 3) }}><Type size={13} /><span>{clip.title || clip.subtitle || "—"}</span></button>)}</div>
          <div className="editor-audio-track">{project.music ? <div className="editor-audio-block" style={{ width: frames * px }}><Music2 size={14} />{assets.find((asset) => asset.id === project.music?.assetId)?.name}</div> : <span className="editor-track-hint">{t("เพิ่มเพลงจากคลังไฟล์")}</span>}</div>
          <div aria-hidden className="editor-playhead" style={{ left: frame * px }}><span /></div>
        </div>
      </div>
    </div>
  );
}
