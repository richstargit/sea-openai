"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, Check, ChevronLeft, ChevronRight, Clapperboard, Copy, Download, Expand, Film, FolderOpen, ImagePlus, LoaderCircle, Maximize, Music2, Pause, Play, Plus, Ratio, Redo2, Scissors, SkipBack, SkipForward, SlidersHorizontal, Trash2, Type, Undo2, Volume2, VolumeX, X, ZoomIn, ZoomOut } from "lucide-react";
import { LanguageSwitcher, useLanguage } from "@/components/language-provider";
import { VideoFormatPicker } from "@/components/video-format-picker";
import { EditorPreview } from "./preview";
import { IconButton } from "./icon-button";
import { Timeline } from "./timeline";
import { FPS, clipStart, commit, editProject, framesOf, locate, newClip, newProject, redo, timecode, totalFrames, uid, undo, type Asset, type Clip, type Edit, type History, type Project } from "@/lib/editor/model";
import { importMedia } from "@/lib/editor/media";
import { listProjects, loadProject, saveProject } from "@/lib/editor/storage";
import { createDemoProject } from "@/lib/editor/demo";
import { exportMp4 } from "@/lib/editor/export";
import "./editor.css";

type Tool = "media" | "text" | "audio" | "adjust" | "crop" | "format";
const tools = [ { id: "media", icon: Film, label: "ไฟล์" }, { id: "text", icon: Type, label: "ข้อความ" }, { id: "audio", icon: Music2, label: "เสียง" }, { id: "adjust", icon: SlidersHorizontal, label: "ปรับภาพ" }, { id: "crop", icon: Maximize, label: "จัดเฟรม" }, { id: "format", icon: Ratio, label: "ขนาด" } ] as const;

function Thumbnail({ asset }: { asset: Asset }) {
  const [url, setUrl] = useState("");
  useEffect(() => { const next = URL.createObjectURL(asset.file); setUrl(next); return () => URL.revokeObjectURL(next); }, [asset]);
  if (asset.kind === "audio") return <Music2 size={24} />;
  if (!url) return <Film size={24} />;
  return asset.kind === "image" ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" /> : <video src={url} muted playsInline preload="metadata" />;
}

export function Editor() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const [history, setHistory] = useState<History | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<Tool>("media");
  const [zoom, setZoom] = useState(50);
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");
  const [notice, setNotice] = useState("");
  const [fatal, setFatal] = useState("");
  const [importing, setImporting] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showProjects, setShowProjects] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [download, setDownload] = useState<string | null>(null);
  const [validSize, setValidSize] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const frameRef = useRef(0);
  const exportController = useRef<AbortController | null>(null);
  const exportUrl = useRef<string | null>(null);
  const initialLoad = useRef<Promise<{ project: Project; assets: Asset[] }> | null>(null);
  const project = history?.present;
  const total = project ? totalFrames(project) : 0;
  const selected = project?.clips.find((clip) => clip.id === selectedId) || project?.clips[0];
  const selectedAsset = assets.find((asset) => asset.id === selected?.assetId);

  const onError = useCallback((message: string) => { setNotice(message); setPlaying(false); }, []);
  const seek = useCallback((next: number) => { setPlaying(false); frameRef.current = next; setFrame(next); }, []);
  const apply = useCallback((edit: Edit, mergeKey?: string) => { setHistory((state) => state ? commit(state, editProject(state.present, edit), mergeKey) : state); }, []);
  const goUndo = useCallback(() => { setPlaying(false); setHistory((state) => state ? undo(state) : state); }, []);
  const goRedo = useCallback(() => { setPlaying(false); setHistory((state) => state ? redo(state) : state); }, []);

  useEffect(() => {
    let active = true;
    if (!initialLoad.current) initialLoad.current = (async () => {
      const requested = new URLSearchParams(window.location.search).get("project");
      if (requested) {
        const saved = await loadProject(requested);
        if (!saved) throw new Error("This project was not found on this device.");
        return saved;
      }
      const latest = (await listProjects())[0];
      if (latest) { const loaded = await loadProject(latest.id); if (loaded) return loaded; }
      return createDemoProject();
    })();
    initialLoad.current.then((result) => { if (!active) return; setAssets(result.assets); setHistory({ past: [], present: result.project, future: [] }); setSelectedId(result.project.clips[0]?.id); })
      .catch((error: unknown) => { if (active) setFatal(error instanceof Error ? error.message : "Could not open the editor."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!project) return;
    setStatus("saving"); let active = true;
    const timer = setTimeout(() => { saveProject(project, assets).then(() => { if (active) setStatus("saved"); }).catch(() => { if (active) { setStatus("error"); setNotice("บันทึกไม่สำเร็จ พื้นที่เบราว์เซอร์อาจเต็ม กรุณาดาวน์โหลดก่อนปิดหน้านี้"); } }); }, 400);
    return () => { active = false; clearTimeout(timer); };
  }, [project, assets]);
  useEffect(() => { if (frameRef.current >= total) { const next = Math.max(0, total - 1); frameRef.current = next; setFrame(next); if (!total) setPlaying(false); } }, [total]);
  useEffect(() => {
    if (!playing || !total) return;
    const start = performance.now(), from = frameRef.current; let request = 0;
    const tick = (now: number) => { const next = Math.min(total - 1, from + Math.floor((now - start) / 1000 * FPS)); frameRef.current = next; setFrame(next); if (next >= total - 1) setPlaying(false); else request = requestAnimationFrame(tick); };
    request = requestAnimationFrame(tick); return () => cancelAnimationFrame(request);
  }, [playing, total]);
  useEffect(() => () => { exportController.current?.abort(); if (exportUrl.current) URL.revokeObjectURL(exportUrl.current); }, []);

  useEffect(() => {
    if (!showProjects && !exporting) return;
    const dialog = document.querySelector<HTMLElement>(".editor-modal");
    if (!dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]'));
    controls()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (showProjects) setShowProjects(false); else if (download) setExporting(false); else exportController.current?.abort(); }
      if (event.key !== "Tab") return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => { document.removeEventListener("keydown", trap); previous?.focus(); };
  }, [showProjects, exporting, download]);

  function togglePlay() { if (!total) return; if (frameRef.current >= total - 1) { frameRef.current = 0; setFrame(0); } setPlaying((value) => !value); }
  function split() { if (!project) return; const current = locate(project, frameRef.current); if (current) { apply({ type: "split", id: current.clip.id, offset: current.offset, newId: uid() }); setSelectedId(current.clip.id); } }
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (exporting || showProjects || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) goRedo(); else goUndo(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "y") { event.preventDefault(); goRedo(); return; }
      if (event.code === "Space" && event.target instanceof HTMLElement && event.target.closest("button,a,[role=slider]")) return;
      if (event.code === "Space") { event.preventDefault(); togglePlay(); }
      else if (event.key.toLowerCase() === "s" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); split(); }
      else if (["Backspace", "Delete"].includes(event.key) && selected) { event.preventDefault(); apply({ type: "delete", id: selected.id }); }
      else if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); seek(Math.max(0, Math.min(total - 1, frameRef.current + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? FPS : 1)))); }
      else if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  });

  async function addFiles(files: File[]) {
    if (!project || !files.length) return;
    setImporting(true); setPlaying(false); const imported: Asset[] = []; const failed: string[] = [];
    try {
      for (const file of files) { try { imported.push(await importMedia(file)); } catch (error) { failed.push(`${file.name}: ${error instanceof Error ? error.message : "Import failed"}`); } }
      if (imported.length) {
        setAssets((items) => [...items, ...imported]);
        setHistory((state) => {
          if (!state) return state;
          let next = editProject(state.present, { type: "project", patch: { assetIds: [...state.present.assetIds, ...imported.map((asset) => asset.id)] } });
          for (const asset of imported) next = asset.kind === "audio" ? editProject(next, { type: "project", patch: { music: { assetId: asset.id, volume: 0.35 } } }) : editProject(next, { type: "append", clip: newClip(asset) });
          return commit(state, next);
        });
        setNotice(failed.length ? failed.join(" · ") : t("เพิ่มไฟล์แล้ว เลือกคลิปบนไทม์ไลน์เพื่อแก้ไข"));
      } else if (failed.length) setNotice(failed.join(" · "));
    } finally { setImporting(false); if (input.current) input.current.value = ""; }
  }
  async function switchProject(id: string) {
    try { if (project) await saveProject(project, assets); const result = await loadProject(id); if (!result) throw new Error("Project not found."); setPlaying(false); setAssets(result.assets); setHistory({ past: [], present: result.project, future: [] }); setSelectedId(result.project.clips[0]?.id); seek(0); setShowProjects(false); setValidSize(true); window.history.replaceState(null, "", `/editor?project=${id}`); } catch (error) { onError(error instanceof Error ? error.message : "Could not open project."); }
  }
  async function startNew() {
    try { if (project) await saveProject(project, assets); const next = newProject(project?.size); await saveProject(next); setPlaying(false); setHistory({ past: [], present: next, future: [] }); setAssets([]); setSelectedId(undefined); seek(0); setShowProjects(false); setTool("media"); setValidSize(true); window.history.replaceState(null, "", `/editor?project=${next.id}`); } catch (error) { onError(error instanceof Error ? error.message : "Could not create project."); }
  }
  async function doExport() {
    if (!project || !total) return;
    setPlaying(false); setExporting(true); setProgress(0); setNotice(""); setDownload(null);
    const controller = new AbortController(); exportController.current = controller;
    try { const blob = await exportMp4(project, assets, setProgress, controller.signal); if (exportUrl.current) URL.revokeObjectURL(exportUrl.current); const url = URL.createObjectURL(blob); exportUrl.current = url; setDownload(url); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setNotice(error instanceof Error ? error.message : t("ส่งออกไม่สำเร็จ")); setExporting(false); }
  }
  function patch(patch: Partial<Clip>, key?: string) { if (selected) apply({ type: "update", id: selected.id, patch }, key); }
  function slider(label: string, value: number, min: number, max: number, step: number, onChange: (value: number, key: string) => void, suffix = "") {
    return <label className="editor-field"><span>{t(label)}<output>{Math.round(value * 100) / 100}{suffix}</output></span><input type="range" aria-label={t(label)} min={min} max={max} step={step} value={value} onPointerDown={(event) => { event.currentTarget.dataset.gesture = uid(); }} onChange={(event) => onChange(Number(event.target.value), event.currentTarget.dataset.gesture || uid())} /></label>;
  }

  if (!project) return <div className="editor-loading"><Clapperboard size={32} /><p>{fatal || t("กำลังเปิดห้องตัดต่อ")}</p>{fatal && <Link href="/studio">{t("กลับไป Studio")}</Link>}</div>;
  const current = locate(project, frame);
  const canSplit = current && current.offset > 0 && current.offset < framesOf(current.clip) - 1;
  const clipIndex = selected ? project.clips.findIndex((clip) => clip.id === selected.id) : -1;

  return (
    <main className="editor-app" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); } }}>
      <header className="editor-header">
        <Link href="/studio" className="editor-back" aria-label={t("กลับไป Studio")} title={t("กลับไป Studio")}><ArrowLeft size={18} /></Link>
        <div className="editor-brand"><Clapperboard size={21} /><span>SnapPromo <span className="editor-brand-light">Edit</span></span></div>
        <div className="editor-project-name"><input aria-label={t("ชื่อโปรเจกต์")} value={project.name} onChange={(event) => apply({ type: "project", patch: { name: event.target.value } }, "project-name")} /><span className="editor-save-state" role="status">{status === "saved" ? <Check size={12} /> : status === "saving" ? <LoaderCircle size={12} className="animate-spin" /> : null}{t(status === "saved" ? "บันทึกบนเครื่องแล้ว" : status === "saving" ? "กำลังบันทึก" : "ยังไม่ได้บันทึก")}</span></div>
        <div className="editor-header-actions"><LanguageSwitcher /><IconButton label={t("โปรเจกต์ของฉัน")} onClick={async () => { try { await saveProject(project, assets); setProjects(await listProjects()); setShowProjects(true); } catch { onError(t("เปิดรายการโปรเจกต์ไม่สำเร็จ")); } }}><FolderOpen size={18} /></IconButton><button type="button" className="editor-primary" onClick={() => void doExport()} disabled={!total || !validSize || importing}><Download size={16} /><span>{t("ส่งออก MP4")}</span></button></div>
      </header>

      <div className="editor-workspace">
        <nav className="editor-tool-rail" aria-label={t("เครื่องมือตัดต่อ")}>
          {tools.map((item) => <button key={item.id} type="button" aria-pressed={tool === item.id} onClick={() => setTool(item.id)} className={`editor-tool ${tool === item.id ? "is-active" : ""}`}><item.icon size={21} strokeWidth={1.7} /><span>{t(item.label)}</span></button>)}
        </nav>
        <aside className="editor-panel" aria-label={t(tools.find((item) => item.id === tool)!.label)}>
          <div className="editor-panel-title"><h1>{t(tools.find((item) => item.id === tool)!.label)}</h1>{tool === "media" && <IconButton label={t("เพิ่มไฟล์")} onClick={() => input.current?.click()} disabled={importing}><Plus size={18} /></IconButton>}</div>
          {tool === "media" ? <>
            <button type="button" className="editor-import" onClick={() => input.current?.click()} disabled={importing}>{importing ? <LoaderCircle className="animate-spin" size={25} /> : <ImagePlus size={25} />}<strong>{t(importing ? "กำลังเพิ่มไฟล์" : "เพิ่มวิดีโอ รูป หรือเสียง")}</strong><span>{t("ลากไฟล์มาวางได้เลย")}</span></button>
            <p className="editor-caption">{t("ไฟล์อยู่ในเบราว์เซอร์นี้เท่านั้น")}</p>
            <div className="editor-library">{assets.map((asset) => <button type="button" key={asset.id} title={t("เพิ่มลงไทม์ไลน์")} onClick={() => { if (asset.kind === "audio") { apply({ type: "project", patch: { music: { assetId: asset.id, volume: 0.35 } } }); setTool("audio"); } else { const clip = newClip(asset); apply({ type: "append", clip }); setSelectedId(clip.id); seek(total); } }} className="editor-media-card"><span className="editor-thumbnail"><Thumbnail asset={asset} /><span className="editor-media-add"><Plus size={16} /></span></span><span className="editor-media-name">{asset.name}</span><span className="editor-caption">{asset.kind === "image" ? t("รูปภาพ") : `${(asset.frames / FPS).toFixed(1)}s`}</span></button>)}</div>
          </> : tool === "format" ? <VideoFormatPicker value={project.size} onChange={(size) => apply({ type: "project", patch: { size } })} onValidityChange={setValidSize} /> : tool === "audio" ? <>
            <p className="editor-section-label">{t("เสียงต้นฉบับ")}</p>
            {selected ? <>{slider("ระดับเสียงคลิป", selected.volume, 0, 1, 0.01, (volume, key) => patch({ volume }, `volume-${key}`))}<button type="button" className="editor-secondary" onClick={() => patch({ volume: selected.volume ? 0 : 1 })}>{selected.volume ? <VolumeX size={16} /> : <Volume2 size={16} />}{t(selected.volume ? "ปิดเสียงคลิป" : "เปิดเสียงคลิป")}</button></> : <p className="editor-caption">{t("เลือกคลิปบนไทม์ไลน์")}</p>}
            <div className="editor-panel-divider" /><p className="editor-section-label">{t("เพลงประกอบ")}</p>
            {project.music ? <><p className="editor-filename">{assets.find((asset) => asset.id === project.music?.assetId)?.name}</p>{slider("ระดับเสียงเพลง", project.music.volume, 0, 1, 0.01, (volume, key) => apply({ type: "project", patch: { music: { assetId: project.music!.assetId, volume } } }, `music-${key}`))}<button type="button" className="editor-secondary" onClick={() => apply({ type: "project", patch: { music: null } })}><Trash2 size={16} />{t("เอาเพลงออก")}</button><p className="editor-caption">{t("เพลงวนซ้ำตามความยาวโปรเจกต์")}</p></> : <button type="button" className="editor-secondary" onClick={() => input.current?.click()}><Plus size={16} />{t("เพิ่มเพลงหรือเสียงบรรยาย")}</button>}
          </> : !selected ? <p className="editor-caption">{t("เลือกคลิปบนไทม์ไลน์")}</p> : tool === "text" ? <>
            <label className="editor-field"><span>{t("ข้อความหลัก")}</span><textarea aria-label={t("ข้อความหลัก")} value={selected.title} rows={3} maxLength={240} placeholder={t("พิมพ์ข้อความบนคลิป")} onChange={(event) => patch({ title: event.target.value }, `title-${selected.id}`)} /></label>
            <label className="editor-field"><span>{t("ข้อความรอง / ซับ")}</span><textarea aria-label={t("ข้อความรอง / ซับ")} value={selected.subtitle} rows={2} maxLength={300} onChange={(event) => patch({ subtitle: event.target.value }, `subtitle-${selected.id}`)} /></label>
            <label className="editor-field"><span>{t("ตำแหน่งข้อความ")}</span><select aria-label={t("ตำแหน่งข้อความ")} value={selected.textPosition} onChange={(event) => patch({ textPosition: event.target.value as Clip["textPosition"] })}><option value="top">{t("ด้านบน")}</option><option value="center">{t("กึ่งกลาง")}</option><option value="bottom">{t("ด้านล่าง")}</option></select></label>
            {slider("ขนาดตัวอักษร", selected.textSize, 2, 12, 0.25, (textSize, key) => patch({ textSize }, `font-${key}`), "%")}
            <label className="editor-field"><span>{t("สีข้อความ")}</span><input type="color" aria-label={t("สีข้อความ")} value={selected.textColor} onChange={(event) => patch({ textColor: event.target.value }, `color-${selected.id}`)} /></label>
          </> : tool === "adjust" ? <>
            {slider("ความสว่าง", selected.brightness, 0.2, 2, 0.01, (brightness, key) => patch({ brightness }, `brightness-${key}`))}
            {slider("คอนทราสต์", selected.contrast, 0.2, 2, 0.01, (contrast, key) => patch({ contrast }, `contrast-${key}`))}
            {slider("ความอิ่มสี", selected.saturation, 0, 2, 0.01, (saturation, key) => patch({ saturation }, `saturation-${key}`))}
            <label className="editor-field"><span>{t("เปลี่ยนช็อต")}</span><select aria-label={t("เปลี่ยนช็อต")} value={selected.transition} onChange={(event) => patch({ transition: event.target.value as Clip["transition"] })}><option value="cut">{t("ตัดตรง")}</option><option value="fade">{t("เฟดผ่านสีดำ")}</option></select></label>
            <button type="button" className="editor-secondary" onClick={() => patch({ brightness: 1, contrast: 1, saturation: 1, transition: "cut" })}>{t("คืนค่าภาพเดิม")}</button>
          </> : <>
            <p className="editor-section-label">{t("การวางภาพ")}</p><div className="editor-segmented"><button type="button" aria-pressed={selected.fit === "contain"} onClick={() => patch({ fit: "contain" })}>{t("เห็นภาพเต็ม")}</button><button type="button" aria-pressed={selected.fit === "cover"} onClick={() => patch({ fit: "cover" })}>{t("เติมเต็มเฟรม")}</button></div>
            <label className="editor-field"><span>{t("ความเร็ว")}</span><select aria-label={t("ความเร็ว")} value={selected.speed} onChange={(event) => patch({ speed: Number(event.target.value) })}>{[0.25, 0.5, 0.75, 1, 1.5, 2, 4].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
            {selectedAsset && <><label className="editor-field"><span>{t("จุดเริ่มต้น (วินาที)")}</span><input type="number" min={0} max={(selected.sourceOut - selected.speed) / FPS} step={1 / FPS} value={Number((selected.sourceIn / FPS).toFixed(3))} onChange={(event) => apply({ type: "trim", id: selected.id, edge: "in", frame: Number(event.target.value) * FPS, maxFrames: selectedAsset.frames })} /></label><label className="editor-field"><span>{t("จุดสิ้นสุด (วินาที)")}</span><input type="number" min={(selected.sourceIn + selected.speed) / FPS} max={selectedAsset.frames / FPS} step={1 / FPS} value={Number((selected.sourceOut / FPS).toFixed(3))} onChange={(event) => apply({ type: "trim", id: selected.id, edge: "out", frame: Number(event.target.value) * FPS, maxFrames: selectedAsset.frames })} /></label></>}
            <p className="editor-caption">{t("ลากขอบคลิปบนไทม์ไลน์เพื่อตัดหัวหรือท้ายได้เช่นกัน")}</p>
          </>}
          {selected && tool !== "media" && tool !== "format" && <div className="editor-selection-footer"><span className="editor-caption">{t("ลำดับคลิป")}</span><div className="editor-row"><IconButton label={t("ย้ายไปก่อนหน้า")} disabled={clipIndex <= 0} onClick={() => apply({ type: "move", id: selected.id, index: clipIndex - 1 })}><ChevronLeft size={17} /></IconButton><span className="editor-caption">{clipIndex + 1} / {project.clips.length}</span><IconButton label={t("ย้ายไปถัดไป")} disabled={clipIndex >= project.clips.length - 1} onClick={() => apply({ type: "move", id: selected.id, index: clipIndex + 1 })}><ChevronRight size={17} /></IconButton></div></div>}
        </aside>

        <section className={`editor-preview-area ${fullscreen ? "is-expanded" : ""}`} aria-label={t("พรีวิว")}>
          <div className="editor-preview-caption"><span>{t("พรีวิว")}</span><span>{project.size.width} × {project.size.height} · {FPS} fps</span><IconButton label={t(fullscreen ? "ย่อพรีวิว" : "ขยายพรีวิว")} onClick={() => setFullscreen((value) => !value)}>{fullscreen ? <X size={17} /> : <Expand size={17} />}</IconButton></div>
          <div className="editor-canvas-stage">{total ? <EditorPreview project={project} assets={assets} frame={frame} playing={playing} onError={onError} /> : <button type="button" className="editor-empty" onClick={() => input.current?.click()}><Clapperboard size={40} strokeWidth={1.3} /><strong>{t("เริ่มเรื่องราวของคุณ")}</strong><span>{t("เพิ่มวิดีโอหรือรูปแรกเพื่อเริ่มตัดต่อ")}</span><span className="editor-primary"><Plus size={16} />{t("เพิ่มไฟล์")}</span></button>}</div>
          <div className="editor-playback"><span className="editor-timecode" data-testid="playhead-time">{timecode(frame)}</span><div className="editor-row"><IconButton label={t("กลับต้นคลิป")} disabled={!total} onClick={() => seek(0)}><SkipBack size={17} /></IconButton><button type="button" className="editor-play" aria-label={t(playing ? "หยุดเล่น" : "เล่นคลิป")} onClick={togglePlay} disabled={!total}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button><IconButton label={t("ไปท้ายคลิป")} disabled={!total} onClick={() => seek(Math.max(0, total - 1))}><SkipForward size={17} /></IconButton></div><span className="editor-timecode">{timecode(total)}</span></div>
        </section>
      </div>

      <section className="editor-timeline" aria-label={t("ไทม์ไลน์")}>
        <div className="editor-timeline-toolbar"><div className="editor-row"><IconButton label={t("ย้อนกลับ (⌘Z)")} onClick={goUndo} disabled={!history?.past.length}><Undo2 size={17} /></IconButton><IconButton label={t("ทำซ้ำ (⇧⌘Z)")} onClick={goRedo} disabled={!history?.future.length}><Redo2 size={17} /></IconButton><span className="editor-divider" /><IconButton label={t("แบ่งคลิป (S)")} onClick={split} disabled={!canSplit}><Scissors size={17} /></IconButton><IconButton label={t("ทำสำเนาคลิป")} disabled={!selected} onClick={() => selected && apply({ type: "duplicate", id: selected.id, newId: uid() })}><Copy size={17} /></IconButton><IconButton label={t("ลบคลิปและปิดช่องว่าง")} disabled={!selected} onClick={() => selected && apply({ type: "delete", id: selected.id })}><Trash2 size={17} /></IconButton><span className="editor-divider" /><IconButton label={t("ตัดหัวถึงตำแหน่งเล่น")} disabled={!selected || !selectedAsset || frame <= clipStart(project, selected.id) || frame >= clipStart(project, selected.id) + framesOf(selected)} onClick={() => selected && selectedAsset && apply({ type: "trim", id: selected.id, edge: "in", frame: selected.sourceIn + (frame - clipStart(project, selected.id)) * selected.speed, maxFrames: selectedAsset.frames })}><ArrowLeftToLine size={17} /></IconButton><IconButton label={t("ตัดท้ายถึงตำแหน่งเล่น")} disabled={!selected || !selectedAsset || frame <= clipStart(project, selected.id) || frame >= clipStart(project, selected.id) + framesOf(selected)} onClick={() => selected && selectedAsset && apply({ type: "trim", id: selected.id, edge: "out", frame: selected.sourceIn + (frame - clipStart(project, selected.id)) * selected.speed, maxFrames: selectedAsset.frames })}><ArrowRightToLine size={17} /></IconButton></div><div className="editor-row"><IconButton label={t("ย่อไทม์ไลน์")} disabled={zoom <= 15} onClick={() => setZoom((value) => Math.max(15, value - 15))}><ZoomOut size={16} /></IconButton><input type="range" aria-label={t("ซูมไทม์ไลน์")} min={15} max={150} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><IconButton label={t("ขยายไทม์ไลน์")} disabled={zoom >= 150} onClick={() => setZoom((value) => Math.min(150, value + 15))}><ZoomIn size={16} /></IconButton></div></div>
        <Timeline project={project} assets={assets} frame={frame} selectedId={selected?.id} zoom={zoom} onSeek={seek} onSelect={(id) => { setSelectedId(id); setPlaying(false); }} onEdit={apply} />
        <div className="editor-bottom-bar"><span>{t("ลากคลิปเพื่อเรียงใหม่ · ลากขอบเพื่อตัด · Space เล่น/หยุด")}</span><span>{project.clips.length} {t("คลิป")} · {timecode(total)}</span></div>
      </section>
      <input ref={input} type="file" accept="video/*,image/*,audio/*" multiple className="sr-only" aria-label={t("เลือกไฟล์สื่อ")} onChange={(event) => void addFiles(Array.from(event.target.files || []))} />
      {notice && <div className="editor-notice" role="status"><span>{t(notice)}</span><button type="button" aria-label={t("ปิดข้อความ")} onClick={() => setNotice("")}><X size={16} /></button></div>}
      {showProjects && <div className="editor-modal-backdrop" onKeyDown={(event) => { if (event.key === "Escape") setShowProjects(false); }}><motion.section role="dialog" aria-modal="true" aria-labelledby="projects-title" className="editor-modal" initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", bounce: 0, duration: 0.3 }}><div className="editor-panel-title"><h2 id="projects-title">{t("โปรเจกต์ของฉัน")}</h2><IconButton label={t("ปิด")} onClick={() => setShowProjects(false)}><X size={18} /></IconButton></div><button type="button" autoFocus className="editor-primary" onClick={() => void startNew()}><Plus size={16} />{t("โปรเจกต์ใหม่")}</button><div className="editor-project-list">{projects.map((item) => <button type="button" key={item.id} onClick={() => void switchProject(item.id)}><Clapperboard size={20} /><span><strong>{item.name}</strong><small>{item.size.width} × {item.size.height} · {timecode(totalFrames(item))}</small></span>{item.id === project.id && <Check size={16} />}</button>)}</div></motion.section></div>}
      {exporting && <div className="editor-modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="export-title" className="editor-modal editor-export-modal"><span className="editor-export-icon">{download ? <Check size={30} /> : <Download size={30} />}</span><h2 id="export-title">{t(download ? "คลิปพร้อมดาวน์โหลด" : "กำลังสร้างไฟล์ MP4")}</h2><p>{project.size.width} × {project.size.height} · H.264 · {FPS} fps</p><progress max={100} value={progress} aria-label={t("ความคืบหน้าการส่งออก")} /><span className="editor-caption">{Math.round(progress)}%</span>{download ? <><a className="editor-primary" href={download} download={`${project.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "SnapPromo"}.mp4`}><Download size={16} />{t("ดาวน์โหลด MP4")}</a><button type="button" className="editor-secondary" autoFocus onClick={() => setExporting(false)}>{t("กลับไปตัดต่อ")}</button></> : <button type="button" className="editor-secondary" autoFocus onClick={() => exportController.current?.abort()}>{t("ยกเลิก")}</button>}</section></div>}
    </main>
  );
}
