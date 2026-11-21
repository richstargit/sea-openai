"use client";

// Fast layer: MediaPipe Face Detector on the control room's own <video> (~8 fps, in the browser, no server).
// Loaded from a CDN at runtime so there is no dependency to install; if it can't load the hook just reports `error`.
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** A box in fractions of the camera frame (0–1), not mirrored. */
export type FaceBox = { x: number; y: number; w: number; h: number };

const VERSION = "0.10.14";
const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const EVERY_MS = 120;
const LOST_MS = 500; // no face for this long = null
const SMOOTH = 0.5;

type Detector = { detectForVideo(video: HTMLVideoElement, ts: number): { detections: { boundingBox?: { originX: number; originY: number; width: number; height: number } }[] }; close(): void };

export function useFaceBox({ video, enabled }: { video: RefObject<HTMLVideoElement | null>; enabled: boolean }) {
  const [box, setBox] = useState<FaceBox | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detector = useRef<Detector | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let smooth: FaceBox | null = null;
    let shown: FaceBox | null = null;
    let seen = 0;
    (async () => {
      try {
        if (!detector.current) {
          const vision = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${BASE}/vision_bundle.mjs`);
          const files = await vision.FilesetResolver.forVisionTasks(`${BASE}/wasm`);
          detector.current = await vision.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL }, runningMode: "VIDEO", minDetectionConfidence: 0.5 });
        }
        if (stopped) return;
        setReady(true);
        setError(null);
        timer = setInterval(() => {
          const v = video.current;
          if (!v || v.readyState < 2 || !v.videoWidth) return;
          const now = performance.now();
          const found = detector.current?.detectForVideo(v, now).detections[0]?.boundingBox;
          if (found) {
            const next = { x: found.originX / v.videoWidth, y: found.originY / v.videoHeight, w: found.width / v.videoWidth, h: found.height / v.videoHeight };
            smooth = smooth ? { x: smooth.x + (next.x - smooth.x) * SMOOTH, y: smooth.y + (next.y - smooth.y) * SMOOTH, w: smooth.w + (next.w - smooth.w) * SMOOTH, h: smooth.h + (next.h - smooth.h) * SMOOTH } : next;
            seen = now;
          } else if (now - seen > LOST_MS) smooth = null;
          // re-render only when the face really moved, not on every frame
          const moved = smooth && shown ? Math.max(Math.abs(smooth.x - shown.x), Math.abs(smooth.y - shown.y), Math.abs(smooth.w - shown.w)) > 0.01 : smooth !== shown;
          if (moved) { shown = smooth; setBox(smooth); }
        }, EVERY_MS);
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { stopped = true; clearInterval(timer); setBox(null); };
  }, [enabled, video]);

  return { box, ready, error };
}
