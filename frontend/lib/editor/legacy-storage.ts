import type { Asset, Project } from "./model";

let connection: Promise<IDBDatabase> | undefined;
function database() {
  if (!connection) connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("snappromo-editor", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("projects", { keyPath: "id" }); request.result.createObjectStore("assets", { keyPath: "id" }); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { connection = undefined; reject(request.error); };
    request.onblocked = () => { connection = undefined; reject(new Error("Close other editor tabs and try again.")); };
  });
  return connection;
}
export async function listProjects(): Promise<Project[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").getAll();
    request.onsuccess = () => resolve((request.result as Project[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error);
  });
}
export async function loadProject(id: string): Promise<{ project: Project; assets: Asset[] } | null> {
  const db = await database();
  const project = await new Promise<Project | undefined>((resolve, reject) => {
    const r = db.transaction("projects").objectStore("projects").get(id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
  if (!project) return null;
  const ids = [...new Set([...(project.assetIds || []), ...project.clips.map((clip) => clip.assetId), ...(project.music ? [project.music.assetId] : [])])];
  const assets = await Promise.all(ids.map((key) => new Promise<Asset>((resolve, reject) => {
    const r = db.transaction("assets").objectStore("assets").get(key);
    r.onsuccess = () => r.result ? resolve(r.result) : reject(new Error("Media is missing. Reimport the original file.")); r.onerror = () => reject(r.error);
  })));
  return { project, assets };
}
