import { FPS, newClip, newProject, uid, type Asset } from "./model";
import type { VideoSize } from "@/lib/video-formats";

export async function createDemoProject(options?: { image?: string; title?: string; caption?: string; size?: VideoSize; name?: string }) {
  const response = await fetch(options?.image || "/editor/chili.svg");
  if (!response.ok) throw new Error("Could not load the product image.");
  const file = await response.blob();
  const asset: Asset = { id: uid(), name: "Product photo", kind: "image", frames: 3600 * FPS, width: 900, height: 1100, file };
  if (options?.image) {
    const image = new Image(); const url = URL.createObjectURL(file);
    try { image.src = url; await image.decode(); asset.width = image.naturalWidth; asset.height = image.naturalHeight; } finally { URL.revokeObjectURL(url); }
  }
  const project = newProject(options?.size);
  project.name = options?.name || "Baan Prik · Product story";
  project.assetIds = [asset.id];
  project.clips = [
    { ...newClip(asset, options?.title || "A little flavor. A big difference."), subtitle: "BAAN PRIK · ROASTED CHILI", textPosition: "top" as const },
    { ...newClip(asset, options?.caption || "Freshly roasted. Every batch."), subtitle: "Made for your everyday meals", fit: "cover" as const, transition: "fade" as const },
    { ...newClip(asset, "Bring flavor to your table"), subtitle: "Order today · ฿89", textPosition: "center" as const, transition: "fade" as const },
  ];
  return { project, assets: [asset] };
}
