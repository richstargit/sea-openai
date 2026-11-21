import type { Asset, Project } from "./model";

type MediaRecord = Omit<Asset, "file"> & { mime: string; chunks: string[] };
type SavedProject = { project: Project; assets: MediaRecord[]; revision: number };

export function createEditorStorage(userId: string) {
  const versions = new Map<string, { revision: number; project: Project }>();
  const uploaded = new WeakMap<Blob, string[]>();
  let pending = Promise.resolve();

  async function request(path: string, options?: RequestInit) {
    const response = await fetch("/agent/editor/" + path, {
      ...options,
      cache: "no-store",
      headers: { ...options?.headers, "x-editor-account": userId },
    });
    if (!response.ok && response.status !== 404) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Could not access this project. Check your account and connection.");
    }
    return response;
  }

  async function uploadAsset({ file, ...asset }: Asset): Promise<MediaRecord> {
    let chunks = uploaded.get(file);
    if (!chunks) {
      chunks = [];
      const chunkSize = 4 * 1024 * 1024;
      for (let start = 0; start < file.size; start += chunkSize) {
        const bytes = await file.slice(start, start + chunkSize).arrayBuffer();
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (byte) => byte.toString(16).padStart(2, "0")).join("");
        const response = await request("chunks/" + hash, {
          method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes,
        });
        if (!response.ok) throw new Error("Could not save the media.");
        chunks.push(hash);
      }
      uploaded.set(file, chunks);
    }
    return { ...asset, mime: file.type, chunks };
  }

  async function loadProject(id: string) {
    const response = await request("projects/" + encodeURIComponent(id));
    if (response.status === 404) return null;
    const { project, assets: records, revision }: SavedProject = await response.json();
    const assets = await Promise.all(records.map(async ({ chunks, mime, ...asset }) => {
      const parts: Blob[] = [];
      for (const hash of chunks) {
        const response = await request("chunks/" + hash);
        if (!response.ok) throw new Error("Project media is missing.");
        parts.push(await response.blob());
      }
      const file = new Blob(parts, { type: mime });
      uploaded.set(file, chunks);
      return { ...asset, file };
    }));
    versions.set(id, { project, revision });
    return { project, assets };
  }

  function saveProject(project: Project, assets: Asset[] = []) {
    const save = pending.then(async () => {
      const previous = versions.get(project.id);
      if (previous?.project === project) return;
      const records = await Promise.all(assets.map(uploadAsset));
      const response = await request("projects/" + project.id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, assets: records, revision: previous?.revision ?? 0 }),
      });
      if (!response.ok) throw new Error("Could not save this project.");
      const { revision } = await response.json();
      versions.set(project.id, { project, revision });
    });
    pending = save.catch(() => {});
    return save;
  }

  async function listProjects(): Promise<Project[]> {
    const response = await request("projects");
    if (!response.ok) throw new Error("Could not list your projects.");
    return response.json();
  }

  return { saveProject, listProjects, loadProject };
}
