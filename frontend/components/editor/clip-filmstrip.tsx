"use client";

import { useEffect, useRef } from "react";
import { FPS, type Asset } from "@/lib/editor/model";

type Props = { asset: Asset; sourceIn: number; sourceOut: number; samples: number };

export function ClipFilmstrip({ asset, sourceIn, sourceOut, samples }: Props) {
  const strip = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = strip.current;
    if (!element || asset.kind !== "image") return;
    const url = URL.createObjectURL(asset.file);
    element.style.setProperty("--shot-image", `url("${url}")`);
    return () => { element.style.removeProperty("--shot-image"); URL.revokeObjectURL(url); };
  }, [asset.file, asset.kind]);

  useEffect(() => {
    const target = canvas.current;
    if (!target || asset.kind !== "video") return;
    const context = target.getContext("2d");
    if (!context) return;
    let active = true;
    let input: import("mediabunny").Input | undefined;
    async function draw() {
      const { ALL_FORMATS, Input, BlobSource, CanvasSink } = await import("mediabunny");
      if (!active) return;
      input = new Input({ formats: ALL_FORMATS, source: new BlobSource(asset.file) });
      const track = await input.getPrimaryVideoTrack();
      if (!active || !track) return;
      const sink = new CanvasSink(track, { width: 120, height: 68, fit: "cover", poolSize: 1 });
      for (let index = 0; index < samples && active; index++) {
        const time = (sourceIn + (sourceOut - sourceIn) * ((index + 0.5) / samples)) / FPS;
        const result = await sink.getCanvas(time);
        if (active && result) context?.drawImage(result.canvas, index * 120, 0);
      }
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void draw().catch(() => {}).finally(() => input?.dispose());
    });
    observer.observe(target);
    return () => { active = false; observer.disconnect(); input?.dispose(); };
  }, [asset.file, asset.kind, samples, sourceIn, sourceOut]);

  return <span ref={strip} className="editor-filmstrip" aria-hidden>
    {asset.kind === "image" && Array.from({ length: samples }, (_, index) => <i key={index} />)}
    {asset.kind === "video" && <canvas ref={canvas} width={samples * 120} height={68} />}
  </span>;
}
