"use client";

import type { HyperframesPlayer } from "@hyperframes/player";
import { createElement, useEffect, useRef } from "react";
import { useLanguage } from "@/components/language-provider";
import { FPS, type Asset, type Project } from "@/lib/editor/model";

type Props = {
  project: Project;
  assets: Asset[];
  frame: number;
  playing: boolean;
  compile: (project: Project, assets: Asset[], signal: AbortSignal) => Promise<string>;
  onTime: (seconds: number) => void;
  onEnded: () => void;
  onError: (message: string) => void;
};

export function EditorPreview({ project, assets, frame, playing, compile, onTime, onEnded, onError }: Props) {
  const { t } = useLanguage();
  const player = useRef<HyperframesPlayer | null>(null);
  const playback = useRef({ frame, playing, onTime, onEnded });
  const sources = useRef(new Map<string, string>());

  useEffect(() => {
    playback.current = { frame, playing, onTime, onEnded };
    const element = player.current;
    if (!element?.ready) return;
    if (playing) {
      if (element.paused) {
        element.seek(frame / FPS);
        element.play();
      }
    } else {
      if (!element.paused) element.pause();
      if (Math.abs(element.currentTime * FPS - frame) >= 0.5) element.seek(frame / FPS);
    }
  }, [frame, playing, onTime, onEnded]);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    const events = new AbortController();
    const options = { signal: events.signal };
    element.addEventListener("ready", () => {
      element.seek(playback.current.frame / FPS);
      if (playback.current.playing) element.play();
    }, options);
    element.addEventListener("timeupdate", () => {
      if (playback.current.playing) playback.current.onTime(element.currentTime);
    }, options);
    element.addEventListener("ended", () => playback.current.onEnded(), options);
    element.addEventListener("playbackerror", () => onError("Could not play this composition."), options);
    return () => events.abort();
  }, [onError]);

  useEffect(() => {
    const urls = new Map(assets.map((asset) => [asset.id, URL.createObjectURL(asset.file)]));
    sources.current = urls;
    return () => { for (const url of urls.values()) URL.revokeObjectURL(url); };
  }, [assets]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      const [, html] = await Promise.all([import("@hyperframes/player"), compile(project, assets, controller.signal)]);
      if (controller.signal.aborted) return;
      player.current?.setAttribute("srcdoc", html.replace(/src="media:([a-f0-9-]+)"/gi, (_, id: string) => `src="${sources.current.get(id)}"`));
    }
    load().catch((error: unknown) => {
      if (!controller.signal.aborted) onError(error instanceof Error ? error.message : "Could not load preview.");
    });
    return () => controller.abort();
  }, [assets, project, compile, onError]);

  const { width, height } = project.size;
  const ratio = width / height;
  return <div aria-label={t("พรีวิววิดีโอ")} className="editor-player" style={{ width: `min(100cqw, ${ratio * 100}cqh)`, aspectRatio: ratio }}>
    {createElement("hyperframes-player", { ref: player, width: String(width), height: String(height), "data-testid": "editor-preview" })}
  </div>;
}
