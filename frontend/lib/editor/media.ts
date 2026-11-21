import { FPS, uid, type Asset } from "./model";

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
