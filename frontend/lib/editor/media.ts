import { FPS, uid, type Asset, type Clip, type Project } from "./model";

export async function importMedia(file: File): Promise<Asset> {
  const kind = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : null;
  if (!kind) throw new Error("Unsupported file. Choose a video, photo or audio file.");
  const url = URL.createObjectURL(file);
  try {
    if (kind === "image") {
      const image = new Image(); image.src = url; await image.decode();
      return { id: uid(), name: file.name, kind, frames: 3600 * FPS, width: image.naturalWidth, height: image.naturalHeight, file };
    }
    const media = document.createElement(kind === "video" ? "video" : "audio");
    media.preload = "metadata"; media.src = url;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Could not read this media file.")), 15000);
      media.onloadedmetadata = () => { clearTimeout(timer); resolve(); };
      media.onerror = () => { clearTimeout(timer); reject(new Error("This file cannot be played in this browser.")); };
    });
    let duration = media.duration;
    if (!Number.isFinite(duration)) {
      const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
      try { duration = await input.computeDuration(); } finally { input.dispose(); }
    }
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("The media duration could not be read.");
    const result: Asset = { id: uid(), name: file.name, kind, frames: Math.max(1, Math.floor(duration * FPS)),
      width: media instanceof HTMLVideoElement ? media.videoWidth : 0, height: media instanceof HTMLVideoElement ? media.videoHeight : 0, file };
    media.removeAttribute("src"); media.load(); return result;
  } finally { URL.revokeObjectURL(url); }
}

type Entry = { url: string; element: HTMLImageElement | HTMLVideoElement | HTMLAudioElement; ready: Promise<void>; revision: number };
export class MediaPool {
  private entries = new Map<string, Entry>();
  get(asset: Asset): Entry {
    const cached = this.entries.get(asset.id); if (cached) return cached;
    const url = URL.createObjectURL(asset.file);
    const element = asset.kind === "image" ? new Image() : document.createElement(asset.kind === "video" ? "video" : "audio");
    const ready = new Promise<void>((resolve, reject) => {
      if (element instanceof HTMLImageElement) { element.onload = () => resolve(); element.onerror = () => reject(new Error("Image could not be loaded.")); }
      else { element.preload = "auto"; if (element instanceof HTMLVideoElement) element.playsInline = true;
        element.onloadeddata = () => resolve(); element.onerror = () => reject(new Error("Media could not be decoded.")); }
    });
    element.src = url; const entry = { url, element, ready, revision: 0 }; this.entries.set(asset.id, entry); return entry;
  }
  async frame(asset: Asset, seconds: number, playing: boolean, speed: number, volume: number) {
    const entry = this.get(asset); const revision = ++entry.revision; await entry.ready;
    if (revision !== entry.revision) return null;
    const element = entry.element;
    if (element instanceof HTMLImageElement) return element;
    element.volume = Math.max(0, Math.min(1, volume)); element.playbackRate = speed; element.preservesPitch = false;
    const target = Math.max(0, Math.min(Math.max(0, element.duration - 0.001), seconds));
    if (Math.abs(element.currentTime - target) > (playing ? 0.15 : 1 / 60)) {
      if (!playing) element.pause();
      await new Promise<void>((resolve, reject) => {
        const done = () => { clearTimeout(timer); element.removeEventListener("seeked", done); resolve(); };
        const timer = setTimeout(() => { element.removeEventListener("seeked", done); reject(new Error("Media seek timed out.")); }, 8000);
        element.addEventListener("seeked", done, { once: true }); element.currentTime = target;
      });
    }
    if (revision !== entry.revision) return null;
    if (playing && element.paused) await element.play();
    if (!playing) element.pause();
    return element instanceof HTMLVideoElement ? element : null;
  }
  pauseExcept(ids: string[] = []) {
    for (const [id, entry] of this.entries) if (!ids.includes(id) && entry.element instanceof HTMLMediaElement) { entry.revision++; entry.element.pause(); }
  }
  dispose() {
    for (const entry of this.entries.values()) { entry.revision++; if (entry.element instanceof HTMLMediaElement) { entry.element.pause(); entry.element.removeAttribute("src"); entry.element.load(); } URL.revokeObjectURL(entry.url); }
    this.entries.clear();
  }
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number, limit: number) {
  const segments = Array.from(new Intl.Segmenter(undefined, { granularity: "word" }).segment(text), (part) => part.segment);
  const lines: string[] = []; let line = "";
  for (const segment of segments) {
    if (context.measureText(line + segment).width > width && line) { lines.push(line.trim()); line = segment.trimStart(); } else line += segment;
  }
  if (line.trim()) lines.push(line.trim());
  if (lines.length > limit) { lines.length = limit; let last = lines[limit - 1]; while (last && context.measureText(last + "…").width > width) last = last.slice(0, -1); lines[limit - 1] = last + "…"; }
  return lines;
}

/** The same painter is used for preview and export so text, grades and crops match. */
export function paintFrame(context: CanvasRenderingContext2D, project: Project, clip: Clip | null, asset: Asset | undefined, source: CanvasImageSource | null, offset: number) {
  const { width: w, height: h } = context.canvas;
  context.save(); context.fillStyle = "#171719"; context.fillRect(0, 0, w, h);
  if (!clip) { context.restore(); return; }
  if (source && asset) {
    const factor = clip.fit === "cover" ? Math.max(w / asset.width, h / asset.height) : Math.min(w / asset.width, h / asset.height);
    const dw = asset.width * factor, dh = asset.height * factor;
    context.filter = `brightness(${clip.brightness}) contrast(${clip.contrast}) saturate(${clip.saturation})`;
    context.drawImage(source, (w - dw) / 2, (h - dh) / 2, dw, dh); context.filter = "none";
  }
  if (clip.title || clip.subtitle) {
    const base = Math.min(w, h), fontSize = Math.max(8, base * clip.textSize / 100), maxWidth = w * 0.84;
    context.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const lines = wrap(context, clip.title, maxWidth, 3);
    context.font = `400 ${fontSize * 0.56}px -apple-system, BlinkMacSystemFont, sans-serif`;
    const sub = wrap(context, clip.subtitle, maxWidth, 2);
    const lineHeight = fontSize * 1.24;
    const block = lines.length * lineHeight + (sub.length ? fontSize * 0.3 + sub.length * fontSize * 0.75 : 0);
    const y = clip.textPosition === "top" ? h * 0.09 : clip.textPosition === "center" ? (h - block) / 2 : h * 0.91 - block;
    const gradient = context.createLinearGradient(0, Math.max(0, y - fontSize * 1.2), 0, Math.min(h, y + block + fontSize));
    gradient.addColorStop(0, "#00000000"); gradient.addColorStop(0.4, "#00000080"); gradient.addColorStop(1, "#00000040");
    context.fillStyle = gradient; context.fillRect(0, Math.max(0, y - fontSize * 1.2), w, block + fontSize * 2.2);
    context.textAlign = "center"; context.textBaseline = "top"; context.fillStyle = clip.textColor;
    context.shadowColor = "#00000080"; context.shadowBlur = fontSize * 0.12;
    context.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
    lines.forEach((line, index) => context.fillText(line, w / 2, y + index * lineHeight, maxWidth));
    context.font = `400 ${fontSize * 0.56}px -apple-system, BlinkMacSystemFont, sans-serif`;
    sub.forEach((line, index) => context.fillText(line, w / 2, y + lines.length * lineHeight + fontSize * 0.3 + index * fontSize * 0.75, maxWidth));
  }
  if (clip.transition === "fade") {
    const duration = Math.max(1, Math.round((clip.sourceOut - clip.sourceIn) / clip.speed));
    const alpha = 1 - Math.min(1, offset / 8, (duration - 1 - offset) / 8);
    context.shadowBlur = 0; context.fillStyle = `rgba(0,0,0,${Math.max(0, alpha)})`; context.fillRect(0, 0, w, h);
  }
  context.restore();
}
