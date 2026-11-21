"use client";

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/language-provider";
import { MediaPool, paintFrame } from "@/lib/editor/media";
import { FPS, locate, type Asset, type Project } from "@/lib/editor/model";

export function EditorPreview({ project, assets, frame, playing, onError }: { project: Project; assets: Asset[]; frame: number; playing: boolean; onError: (message: string) => void }) {
  const { t } = useLanguage();
  const canvas = useRef<HTMLCanvasElement>(null);
  const pool = useRef<MediaPool | null>(null);
  const revision = useRef(0);
  useEffect(() => { const instance = new MediaPool(); pool.current = instance; return () => { instance.dispose(); }; }, []);
  useEffect(() => {
    const currentRevision = ++revision.current;
    const current = locate(project, frame), media = pool.current;
    if (!media || !canvas.current) return;
    const target = canvas.current;
    const scale = Math.min(1, 1280 / Math.max(project.size.width, project.size.height));
    const w = Math.round(project.size.width * scale), h = Math.round(project.size.height * scale);
    if (target.width !== w || target.height !== h) { target.width = w; target.height = h; }
    const context = target.getContext("2d"); if (!context) return;
    const activeIds = [...(current ? [current.clip.assetId] : []), ...(project.music ? [project.music.assetId] : [])];
    media.pauseExcept(playing ? activeIds : []);
    async function draw() {
      const asset = assets.find((item) => item.id === current?.clip.assetId);
      const source = current && asset ? await media!.frame(asset, (current.clip.sourceIn + current.offset * current.clip.speed) / FPS, playing, current.clip.speed, current.clip.volume) : null;
      if (currentRevision !== revision.current) return;
      paintFrame(context!, project, current?.clip || null, asset, source, current?.offset || 0);
      if (project.music) {
        const music = assets.find((item) => item.id === project.music?.assetId);
        if (music) await media!.frame(music, (frame % music.frames) / FPS, playing, 1, project.music.volume);
      }
    }
    draw().catch((error: unknown) => { if (currentRevision === revision.current) onError(error instanceof Error ? error.message : "Preview could not be loaded."); });
    return () => { revision.current++; };
  }, [project, assets, frame, playing, onError]);
  return <canvas ref={canvas} data-testid="editor-preview" aria-label={t("พรีวิววิดีโอ")} role="img" className="block max-h-full max-w-full rounded-lg shadow-2xl" style={{ aspectRatio: `${project.size.width} / ${project.size.height}`, width: project.size.width > project.size.height ? "100%" : "auto", height: project.size.width > project.size.height ? "auto" : "100%", objectFit: "contain" }} />;
}
