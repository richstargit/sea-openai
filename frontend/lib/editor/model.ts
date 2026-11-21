/*
 * Browser adaptation of FilmCraft's split_track_at / move_edge / ripple-delete
 * semantics and snapshot history. See docs/licenses/filmcraft-MIT.txt and docs/filmcraft.md.
 * Edits use integer frames at a fixed 30 fps, not FilmCraft's Rust tick ABI.
 */
import type { VideoSize } from "@/lib/video-formats";

export const FPS = 30;
export type MediaKind = "video" | "image" | "audio";
export type Asset = { id: string; name: string; kind: MediaKind; frames: number; width: number; height: number; file: Blob };
export type Clip = {
  id: string; assetId: string; sourceIn: number; sourceOut: number; speed: number; volume: number;
  title: string; subtitle: string; textPosition: "top" | "center" | "bottom"; textColor: string;
  textSize: number; fit: "contain" | "cover"; brightness: number; contrast: number; saturation: number;
  transition: "cut" | "fade";
  camera?: "static" | "push-in" | "pull-out" | "pan-left" | "pan-right";
};
export type Project = {
  version: 1; id: string; name: string; size: VideoSize; clips: Clip[]; assetIds: string[];
  music: { assetId: string; volume: number } | null; updatedAt: number;
};
export type History = { past: Project[]; present: Project; future: Project[]; mergeKey?: string };
export type Edit =
  | { type: "split"; id: string; offset: number; newId: string }
  | { type: "trim"; id: string; edge: "in" | "out"; frame: number; maxFrames: number }
  | { type: "delete"; id: string }
  | { type: "duplicate"; id: string; newId: string }
  | { type: "move"; id: string; index: number }
  | { type: "update"; id: string; patch: Partial<Omit<Clip, "id" | "assetId" | "sourceIn" | "sourceOut">> }
  | { type: "append"; clip: Clip }
  | { type: "project"; patch: Partial<Pick<Project, "name" | "size" | "music" | "assetIds">> };

export const uid = () => crypto.randomUUID();
export const framesOf = (clip: Clip) => Math.max(1, Math.round((clip.sourceOut - clip.sourceIn) / clip.speed));
export const totalFrames = (project: Project) => project.clips.reduce((sum, clip) => sum + framesOf(clip), 0);
export function locate(project: Project, frame: number) {
  let start = 0;
  for (const clip of project.clips) {
    const end = start + framesOf(clip);
    if (frame >= start && frame < end) return { clip, start, offset: frame - start };
    start = end;
  }
  return null;
}
export function clipStart(project: Project, id: string) {
  let frame = 0;
  for (const clip of project.clips) { if (clip.id === id) return frame; frame += framesOf(clip); }
  return 0;
}
export function newClip(asset: Asset, title = ""): Clip {
  return { id: uid(), assetId: asset.id, sourceIn: 0, sourceOut: asset.kind === "image" ? 5 * FPS : asset.frames,
    speed: 1, volume: 1, title, subtitle: "", textPosition: "bottom", textColor: "#ffffff", textSize: 5,
    fit: "contain", brightness: 1, contrast: 1, saturation: 1, transition: "cut" };
}
export function newProject(size: VideoSize = { width: 1920, height: 1080 }): Project {
  return { version: 1, id: uid(), name: "Untitled project", size, clips: [], assetIds: [], music: null, updatedAt: Date.now() };
}

/** Validate first; an invalid edit leaves the original project untouched. */
export function editProject(project: Project, edit: Edit): Project {
  const clips = project.clips.map((clip) => ({ ...clip }));
  const index = "id" in edit ? clips.findIndex((clip) => clip.id === edit.id) : -1;
  const clip = clips[index];
  if ("id" in edit && !clip) return project;
  switch (edit.type) {
    case "split": {
      const cut = Math.round(edit.offset);
      if (cut <= 0 || cut >= framesOf(clip)) return project;
      const sourceCut = clip.sourceIn + cut * clip.speed;
      if (sourceCut <= clip.sourceIn || sourceCut >= clip.sourceOut) return project;
      const right = { ...clip, id: edit.newId, sourceIn: sourceCut };
      clip.sourceOut = sourceCut;
      clips.splice(index + 1, 0, right);
      break;
    }
    case "trim": {
      const value = Math.round(edit.frame * 4) / 4;
      if (!Number.isFinite(value)) return project;
      if (edit.edge === "in") clip.sourceIn = Math.max(0, Math.min(clip.sourceOut - clip.speed, value));
      else clip.sourceOut = Math.min(edit.maxFrames, Math.max(clip.sourceIn + clip.speed, value));
      if (clip.sourceOut <= clip.sourceIn) return project;
      break;
    }
    case "delete": clips.splice(index, 1); break; // Sequence closes the gap, including attached titles/audio.
    case "duplicate": clips.splice(index + 1, 0, { ...clip, id: edit.newId }); break;
    case "move": clips.splice(index, 1); clips.splice(Math.max(0, Math.min(clips.length, edit.index)), 0, clip); break;
    case "update": {
      const patch = { ...edit.patch };
      if (patch.speed !== undefined && ![0.25, 0.5, 0.75, 1, 1.5, 2, 4].includes(patch.speed)) return project;
      for (const key of ["volume", "brightness", "contrast", "saturation", "textSize"] as const) {
        if (patch[key] !== undefined && !Number.isFinite(patch[key])) return project;
      }
      if (patch.volume !== undefined) patch.volume = Math.max(0, Math.min(1, patch.volume));
      Object.assign(clip, patch);
      break;
    }
    case "append": clips.push({ ...edit.clip }); break;
    case "project": return { ...project, ...edit.patch, updatedAt: Date.now() };
  }
  return { ...project, clips, updatedAt: Date.now() };
}
export function commit(history: History, next: Project, mergeKey?: string): History {
  if (next === history.present) return history;
  return { past: mergeKey && history.mergeKey === mergeKey ? history.past : [...history.past, history.present].slice(-100),
    present: next, future: [], mergeKey };
}
export function undo(history: History): History {
  const previous = history.past.at(-1);
  return previous ? { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] } : history;
}
export function redo(history: History): History {
  const next = history.future[0];
  return next ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) } : history;
}
export function timecode(frame: number) {
  const seconds = Math.floor(Math.max(0, frame) / FPS);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}:${String(Math.max(0, Math.floor(frame)) % FPS).padStart(2, "0")}`;
}
