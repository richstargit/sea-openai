import { importMedia } from "./media";
import { FPS, newClip, newProject } from "./model";
import { createEditorStorage } from "./storage";

type Film = { id: string; name: string; title?: string; sceneStarts?: number[] };

// size: the frame the user picked in the studio; the clip is placed into it (defaults to the clip's own size)
export async function openStudioFilm(userId: string, film: Film, size?: { width: number; height: number }) {
  const storage = createEditorStorage(userId);
  if (await storage.hasProject(film.id)) return film.id;
  const response = await fetch(`/agent/files/${encodeURIComponent(film.id)}`);
  if (!response.ok) throw new Error("Could not open the generated film.");
  const asset = await importMedia(new File([await response.blob()], film.name, { type: "video/webm" }));
  const project = newProject(size ?? { width: asset.width, height: asset.height });
  project.id = film.id;
  project.name = film.title || film.name;
  project.assetIds = [asset.id];
  const cuts = new Set([0, asset.frames]);
  for (const time of film.sceneStarts ?? []) {
    const frame = Math.round(time * FPS);
    if (frame > 0 && frame < asset.frames) cuts.add(frame);
  }
  const boundaries = [...cuts].sort((a, b) => a - b);
  project.clips = boundaries.slice(1).map((sourceOut, index) => ({
    ...newClip(asset), sourceIn: boundaries[index], sourceOut,
  }));
  try {
    await storage.saveProject(project, [asset]);
  } catch (error) {
    if (!(await storage.hasProject(film.id))) throw error;
  }
  return project.id;
}
