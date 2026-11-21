"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BrainCircuit, Camera, ChevronLeft, ChevronRight, Copy, Crosshair, Eraser, Eye, Film, Heart, Link2, Mic, MonitorPlay,
  PartyPopper, Radio, RotateCw, ScanSearch, ShoppingCart, Smartphone, Tag, TriangleAlert, Vote, ZoomIn,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { playOverlay, studioPost, studioRequest } from "@/components/studio/studio-api";
import { publicLiveDetectOrigin } from "@/lib/backend";
import { type BridgeMessage, type Decision, type LiveProduct, type Segment, commandDetect, detectUrl, director, productImage } from "@/lib/live-plan";
import type { StepProps } from "./live-studio";
import "./control-room.css";

// The live control room: program monitor (camera + the same overlay OBS shows), connections, the embedded detector,
// realtime speech, Decisions AI, the director's script, a team feed and host buttons. Two modes: OBS (events go to
// the Browser Source and the monitor) and Demo (a simulated phone live on this screen, events go to the monitor only).

type Box = { x: number; y: number; w: number; h: number };
type Kind = "price_pop" | "price_drop" | "free_badge" | "low_stock" | "product_card" | "poll" | "fireworks" | "zoom" | "caption";
type OverlayEvent = Record<string, unknown>;
type Role = "ผู้กำกับ" | "Motion" | "ซับ" | "โปรดิวเซอร์" | "คนตัดต่อ";
type Tone = "info" | "action" | "warn" | "error";
type FeedItem = { id: number; time: string; role: Role; text: string; tone: Tone; count: number };
type ChatItem = { id: number; name: string; text: string; kind: "chat" | "cf" | "heart" };
type Mode = "obs" | "demo";
type Status = "ok" | "warn" | "err" | "off";
type Queued = { event: OverlayEvent; key: string; role: Role; text: string };

// Web Speech API (Chrome ships it prefixed and TypeScript's DOM lib does not declare it)
type SpeechEvent = { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; abort(): void;
  onresult: ((e: SpeechEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
const speechCtor = () => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

const DETECT_ORIGIN = new URL(publicLiveDetectOrigin).origin;
const PREVIEW_SRC = "/overlay/index.html?preview=1#" + "a".repeat(43); // index.html: "/overlay/" gets a trailing-slash redirect from Next
const MODE_KEY = "snappromo-live-mode";
const BIG_GAP = 3500; // at most one big motion per 3.5 s
const DECIDE_EVERY = 1200;
const STOCK = 10;

const LABEL: Record<Kind | "spotlight" | "clip", string> = {
  price_pop: "เด้งราคา", price_drop: "ขีดฆ่าราคา", free_badge: "ป้ายของแถม", low_stock: "ป้ายเหลือน้อย", product_card: "การ์ดสินค้า",
  poll: "เปิดโหวต", fireworks: "พลุ", zoom: "ซูมสินค้า", caption: "ขึ้นซับ", spotlight: "สปอตไลต์สินค้า", clip: "เปิดคลิปกันเงียบ",
};
const roleFor = (kind: string): Role => (kind === "zoom" || kind === "clip" ? "คนตัดต่อ" : kind === "caption" ? "ซับ" : "Motion");
// which motion-kit moment replaces a LiveCut event when the kit exists
const KIT_MOMENT: Partial<Record<Kind, "price" | "deal" | "productIn" | "celebrate">> = { price_pop: "price", price_drop: "deal", product_card: "productIn", fireworks: "celebrate" };
const MOMENT_NOTES: Record<string, string> = {
  intro: "เปิดไลฟ์", productIn: "ตอนยกสินค้าขึ้นมาโชว์", price: "ตอนพูดราคา", deal: "ตอนบอกโปร ลด แถม", callToAction: "ตอนเชิญชวนให้กดสั่ง",
  transition: "ตอนเปลี่ยนสินค้า", celebrate: "ตอนฉลองยอดขาย", deadAir: "ตอนไลฟ์เงียบ", outro: "ปิดไลฟ์",
};
const GENERAL_MOTIONS: [string, string][] = [
  ["price-pop", "เด้งราคา"], ["price-drop", "ขีดฆ่าราคาเดิม"], ["product-card", "การ์ดสินค้า"], ["stamp-free-ship", "ตราส่งฟรี"],
  ["stock-bar", "แถบสต็อกเหลือน้อย"], ["cf-keycaps", "ชวนพิมพ์ CF"], ["kinetic-claim", "ตัวหนังสือเน้นจุดเด่น"],
  ["callout-ring", "วงชี้สินค้า"], ["fireworks", "พลุฉลอง"], ["iris-swap", "เปลี่ยนสินค้า"],
];

// ---------- fast keyword layer (no AI) ----------
const DROP = /ลด|discount|\boff\b|sale/i;
const PRICE = /(\d[\d,]*(?:\.\d+)?)\s*(?:บาท|baht)/i;
const FREE = /ส่งฟรี|แถม|ฟรี|free/i;
const LOW = /ชิ้นสุดท้าย|เหลือน้อย|last one|almost gone|low stock/i;
const ZOOM = /ดูตรงนี้|ซูม|look here|zoom/i;
type KeywordHit = { kind: "price_drop" | "price_pop" | "free_badge" | "low_stock" | "zoom"; nums: number[]; text?: string };
function keywordHits(raw: string): KeywordHit[] {
  const text = raw.replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
  const nums = (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, ""))).filter((n) => Number.isFinite(n) && n > 0);
  const hits: KeywordHit[] = [];
  const price = text.match(PRICE);
  if (DROP.test(text)) hits.push({ kind: "price_drop", nums });
  else if (price) hits.push({ kind: "price_pop", nums: [Number(price[1].replace(/,/g, ""))] });
  if (FREE.test(text)) hits.push({ kind: "free_badge", nums, text: /ส่งฟรี|free ship/i.test(text) ? "ส่งฟรี" : /แถม/.test(text) ? "แถมฟรี" : "ฟรี" });
  if (LOW.test(text)) hits.push({ kind: "low_stock", nums });
  if (ZOOM.test(text)) hits.push({ kind: "zoom", nums });
  return hits;
}

// ---------- demo chat ----------
const NAMES = ["แอน", "มิ้นท์", "พี่เจ", "ต้นข้าว", "น้องฟ้า", "ปอนด์", "เบียร์", "ใบเตย", "กอล์ฟ", "แพรว", "โอ๊ต", "นุ่น", "ป๊อป", "จูน", "บิว", "เฟิร์น", "ข้าวหอม", "พี่หนึ่ง"];
const HELLO = ["สวัสดีค่า", "มาแล้วค่า", "เพิ่งเข้ามา ขายอะไรอยู่คะ", "ติดตามตลอดเลยค่ะ", "เสียงชัดมาก", "รอไลฟ์นี้อยู่เลย", "แม่ค้าน่ารัก"];
const ASK = (name: string) => [`${name} ราคาเท่าไหร่คะ`, `${name} มีสีอื่นไหม`, "ส่งฟรีไหมคะ", `ขอดู${name}ใกล้ ๆ หน่อย`, `${name} ใช้ยังไงคะ`, `${name} เหลือกี่ชิ้นคะ`];
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REVIEWS = ["ใช้ดีมาก ซื้อซ้ำรอบที่ 2 แล้วค่ะ", "ส่งไว แพ็กมาดีมาก", "คุ้มราคาสุด ๆ", "ของตรงปก ชอบมากค่ะ"];
const shortList = (items: string[]) => items.map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 18)).slice(0, 3);

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");
const timecode = (s: number) => `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
const mmss = (s: number) => `${s < 0 ? "-" : ""}${pad(Math.abs(s) / 60)}:${pad(Math.abs(s) % 60)}`;
const baht = (n: number) => "฿" + n.toLocaleString("th-TH");
const pct = (n: number | null | undefined) => (n == null ? "" : Math.round(n * 100) + "%");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function ControlRoom({ plan, products, overlayOrigin }: StepProps & { overlayOrigin: string }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("obs");
  const [live, setLive] = useState(false);
  const [clock, setClock] = useState(0); // whole seconds, drives every timer on screen
  const [startSec, setStartSec] = useState(0);
  const [segIndex, setSegIndex] = useState(0);
  const [segStartSec, setSegStartSec] = useState(0);
  // camera
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [activeCamera, setActiveCamera] = useState<{ id: string; label: string } | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  // connections
  const [obsConnected, setObsConnected] = useState<number | null>(null);
  const [obsUrl, setObsUrl] = useState("");
  const [obsBusy, setObsBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detectSrc, setDetectSrc] = useState("");
  const [detectorUp, setDetectorUp] = useState<boolean | null>(null);
  const [detectorOpen, setDetectorOpen] = useState(true);
  const [detect, setDetect] = useState<{ running: boolean; products: number | null; latency: number | null; name: string; confidence: number | null }>({ running: false, products: null, latency: null, name: "", confidence: null });
  const [box, setBox] = useState<Box | null>(null);
  const [ai, setAi] = useState<{ latency: number | null; error: string }>({ latency: null, error: "" });
  const [speech, setSpeech] = useState<"off" | "on" | "unsupported" | "error">("off");
  const [lines, setLines] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  // director output
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [warning, setWarning] = useState<{ text: string; at: number } | null>(null);
  const [suggestPoll, setSuggestPoll] = useState(false);
  const [spotId, setSpotId] = useState("");
  // demo
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [viewers, setViewers] = useState(1240);
  const [stock, setStock] = useState<Record<string, number>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const detectRef = useRef<HTMLIFrameElement>(null);
  const liveRef = useRef(false);
  const recRef = useRef<Recognition | null>(null);
  const finals = useRef<{ text: string; at: number }[]>([]);
  const frame = useRef<{ image: string; at: number } | null>(null);
  const lastFrameSent = useRef(0);
  const lastDecideAt = useRef(0);
  const inFlight = useRef(false);
  const queue = useRef<Queued[]>([]);
  const lastBig = useRef(0);
  const lastByKey = useRef(new Map<string, number>());
  const firedCues = useRef(new Set<string>());
  const lowEnergy = useRef(0);
  const lastConfirmed = useRef<string | null>(null);
  const lastAiProduct = useRef<string | null>(null);
  const feedId = useRef(0);
  const chatId = useRef(0);
  const rng = useRef(mulberry32(20261121));
  // show engine
  const lastSignal = useRef(0);
  const nextGap = useRef(6000);
  const lastPreset = useRef("");
  const beatIndex = useRef(0);
  const lastPoll = useRef(0);
  const lastCf = useRef<{ name: string; qty: number; product: string } | null>(null);
  const sold = useRef(0);
  const discount = useRef<{ id: string; from: number; to: number } | null>(null);
  const latest = useRef<{ tick: () => void; bridge: (m: BridgeMessage) => void; speech: (e: SpeechEvent) => void; chat: () => number; decision: (d: Decision, rtt: number) => void; log: (role: Role, text: string, tone?: Tone) => void } | null>(null);

  // ---------- derived ----------
  const lineup = plan.lineup.flatMap((item) => products.filter((p) => p.id === item.productId));
  const pool = lineup.length ? lineup : products;
  // no AI script yet: a plain run-of-show from the lineup so there is always a current product and a timer
  const segments: Segment[] = plan.script?.segments ?? (pool.length ? [
    { kind: "intro", productId: null, title: "เปิดไลฟ์", seconds: 30, opening: `สวัสดีค่า ยินดีต้อนรับสู่ไลฟ์${plan.style.shop ? " " + plan.style.shop : ""}`, talkingPoints: [], callToAction: "กดติดตามไว้ได้เลย", cues: [] },
    ...pool.map((p): Segment => {
      const item = plan.lineup.find((x) => x.productId === p.id);
      return { kind: "product", productId: p.id, title: p.name, seconds: Math.round((item?.minutes || 2) * 60), opening: `ตัวต่อไป ${p.name} ราคา ${baht(p.price)}`, talkingPoints: shortList((item?.points || p.distinct || p.description || "").split(/[\n,·•|]/)), callToAction: `พิมพ์ CF ${p.id} ได้เลย`, cues: [] };
    }),
    { kind: "outro", productId: null, title: "ปิดไลฟ์", seconds: 30, opening: "ขอบคุณทุกคนที่มาดูไลฟ์วันนี้", talkingPoints: [], callToAction: "เจอกันไลฟ์หน้านะคะ", cues: [] },
  ] : []);
  const segment = segments[Math.min(segIndex, segments.length - 1)] ?? null;
  const current: LiveProduct | null = (segment?.productId && products.find((p) => p.id === segment.productId)) || lineup[0] || null;
  const elapsed = live ? clock - startSec : 0;
  const inSegment = live ? clock - segStartSec : 0;
  const remaining = segment ? segment.seconds - inSegment : 0;
  const kit = plan.kit;
  const tagStyle = kit?.theme.tagStyle ?? plan.style.tagStyle;

  // ---------- setup ----------
  useEffect(() => {
    queueMicrotask(() => {
      try { const saved = localStorage.getItem(MODE_KEY); if (saved === "obs" || saved === "demo") setMode(saved); } catch { /* optional */ }
      setDetectSrc(detectUrl(DETECT_ORIGIN));
      if (!speechCtor()) setSpeech("unsupported");
    });
  }, []);
  const pingDetector = useCallback(() => {
    // no-cors: an opaque response still proves the service is listening; a network error means it is down
    fetch(DETECT_ORIGIN + "/detect", { mode: "no-cors", cache: "no-store" }).then(() => setDetectorUp(true), () => setDetectorUp(false));
  }, []);
  useEffect(() => { pingDetector(); }, [pingDetector]);

  // camera preview: prefer OBS Virtual Camera so the monitor shows the same picture OBS has
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    if (!navigator.mediaDevices?.getUserMedia) { queueMicrotask(() => setCameraError("เบราว์เซอร์นี้เปิดกล้องไม่ได้")); return; }
    navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { width: 1280, height: 720 }, audio: false })
      .then(async (s) => {
        if (stopped) { s.getTracks().forEach((track) => track.stop()); return; }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
        const track = s.getVideoTracks()[0];
        setActiveCamera({ id: track.getSettings().deviceId ?? "", label: track.label });
        setCameraError("");
        track.onended = () => setCameraError("กล้องถูกตัดการเชื่อมต่อ");
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        if (stopped) return;
        setCameras(devices);
        const obs = devices.find((d) => /obs virtual camera/i.test(d.label));
        if (!deviceId && obs && obs.deviceId !== track.getSettings().deviceId) setDeviceId(obs.deviceId);
      })
      .catch((error) => { if (!stopped) setCameraError(message(error)); });
    return () => { stopped = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, [deviceId]);

  // OBS Browser Source status (same endpoint as live-controls)
  useEffect(() => {
    if (mode !== "obs") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (document.visibilityState === "visible") {
        try {
          const result = await studioRequest<{ connected: number }>("/agent/overlay/status", { signal: controller.signal, cache: "no-store" });
          if (!controller.signal.aborted) setObsConnected(result.connected);
        } catch {
          if (!controller.signal.aborted) setObsConnected(null);
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, obsUrl]);

  // bridge from the embedded detector: only its origin, only its source tag
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== DETECT_ORIGIN || event.data?.source !== "snappromo-live") return;
      latest.current?.bridge(event.data as BridgeMessage);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const id = setInterval(() => latest.current?.tick(), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!live || mode !== "demo") return;
    let timer: ReturnType<typeof setTimeout>;
    const step = () => { timer = setTimeout(step, latest.current?.chat() ?? 2000); };
    timer = setTimeout(step, 600);
    return () => clearTimeout(timer);
  }, [live, mode]);

  useEffect(() => {
    const detector = detectRef;
    return () => {
      liveRef.current = false;
      const rec = recRef.current;
      recRef.current = null;
      rec?.abort();
      commandDetect(detector.current, DETECT_ORIGIN, "stop");
    };
  }, []);

  // ---------- output ----------
  function log(role: Role, text: string, tone: Tone = "info") {
    const id = ++feedId.current;
    const time = new Date().toLocaleTimeString("th-TH", { hour12: false });
    setFeed((items) => items[0]?.text === text && items[0].role === role
      ? [{ ...items[0], time, count: items[0].count + 1 }, ...items.slice(1)]
      : [{ id, time, role, text, tone, count: 1 }, ...items].slice(0, 80));
  }
  function send(event: OverlayEvent) {
    previewRef.current?.contentWindow?.postMessage({ source: "snappromo-control", event }, window.location.origin);
    if (mode === "obs") playOverlay(event).catch((error) => log("โปรดิวเซอร์", t("ส่งไป OBS ไม่สำเร็จ") + ": " + message(error), "error"));
  }
  /** Big motions share one 3.5 s slot; the rest wait in a short queue. cooldown: ignore the same key for that long. */
  function enqueue(item: Queued, cooldown = 0) {
    if (cooldown && Date.now() - (lastByKey.current.get(item.key) ?? -1e9) < cooldown) return;
    if (queue.current.some((q) => q.key === item.key)) return;
    lastSignal.current = Date.now(); // the show engine backs off while real signals arrive
    queue.current.push(item);
    if (queue.current.length > 4) queue.current.shift();
    pump();
  }
  function pump() {
    if (!queue.current.length || Date.now() - lastBig.current < BIG_GAP) return;
    play(queue.current.shift()!);
  }
  function play(item: Queued) {
    lastBig.current = Date.now();
    lastByKey.current.set(item.key, Date.now());
    lastPreset.current = item.key;
    send(item.event);
    log(item.role, item.text, "action");
  }

  // the monitor crops the camera (object-fit: cover) and mirrors it in demo mode; map detector boxes onto it
  function toView(b: Box): Box {
    const container = mode === "demo" ? 9 / 16 : 16 / 9;
    const sx = videoAspect > container ? videoAspect / container : 1;
    const sy = videoAspect > container ? 1 : container / videoAspect;
    const x = b.x * sx + (1 - sx) / 2, w = b.w * sx;
    return { x: mode === "demo" ? 1 - x - w : x, y: b.y * sy + (1 - sy) / 2, w, h: b.h * sy };
  }
  function placement(): { x?: number; y?: number; box?: Box } {
    if (!box) return {};
    const b = mode === "demo" ? toView(box) : box; // OBS gets camera coordinates, the phone frame its own
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, box: b };
  }
  const imageUrl = (p: LiveProduct) => (p.images[0] ? new URL(productImage(p.images[0]), window.location.origin).href : undefined);
  const productData = (p: LiveProduct | null) => (p ? { name: p.name, price: p.price, productId: p.id, style: tagStyle } : { style: tagStyle });

  function buildEvent(kind: Kind, p: LiveProduct | null, extra: Record<string, unknown> = {}): OverlayEvent {
    const at = placement();
    if (kind === "zoom") return { type: "zoom", payload: at.box ? { box: at.box } : { x: 0.5, y: 0.5 }, ttl: 3000 };
    if (kind === "caption") return { type: "caption", payload: extra, ttl: 2500 };
    if (kind === "poll") {
      const options = pool.length > 1 ? pool.slice(0, 3).map((x) => ({ label: x.name, votes: 0 })) : [{ label: "รับเลย", votes: 0 }, { label: "ขอดูก่อน", votes: 0 }];
      return { type: "poll", payload: { question: pool.length > 1 ? "อยากให้ไลฟ์ตัวไหนต่อ?" : `รับ${p?.name ?? "ตัวนี้"}ไหม?`, options }, ttl: 6000 };
    }
    const data = { ...productData(p), ...extra };
    const moment = KIT_MOMENT[kind];
    if (kit && moment) return { type: "graphic", preset: kit.moments[moment], data, ...at, image: p ? imageUrl(p) : undefined, theme: kit.theme.look, ttl: 2200 };
    return { type: kind, payload: kind === "product_card" ? { ...data, ...at, image: p ? imageUrl(p) : undefined } : data, ttl: 2200 };
  }
  /** spotlight at the tracked box when there is one, else the product card */
  function productEvent(p: LiveProduct): { event: OverlayEvent; label: string } {
    const at = placement();
    if (at.box) return { event: { type: "spotlight", ...at, image: imageUrl(p), name: p.name, price: p.price, motion: "pop" }, label: "spotlight" };
    return { event: buildEvent("product_card", p), label: "product_card" };
  }
  const describe = (kind: string, p: LiveProduct | null) => t(LABEL[kind as Kind] ?? kind) + (p ? ` · ${p.name}${kind.startsWith("price") ? " " + baht(p.price) : ""}` : "");

  function now(kind: Kind, p: LiveProduct | null, extra?: Record<string, unknown>) {
    play({ event: buildEvent(kind, p, extra), key: kind, role: roleFor(kind), text: describe(kind, p) });
  }
  function showProductNow(p: LiveProduct | null) {
    if (!p) return log("โปรดิวเซอร์", t("ยังไม่มีสินค้าให้โชว์"), "warn");
    const { event, label } = productEvent(p);
    play({ event, key: "product_card", role: "Motion", text: describe(label, p) });
  }
  function playClip() {
    const clip = plan.clips.find((c) => c.productId === current?.id) ?? plan.clips[0];
    if (!clip) return log("คนตัดต่อ", t("ยังไม่มีคลิปกันเงียบ เตรียมได้ที่ขั้นตอน 3"), "warn");
    send({ type: "clip", fileId: clip.fileId });
    log("คนตัดต่อ", t("เปิดคลิปกันเงียบ") + " · " + clip.name, "action");
  }
  function goSegment(index: number) {
    if (!segments.length) return;
    const i = Math.max(0, Math.min(segments.length - 1, index));
    setSegIndex(i);
    setSegStartSec(Math.floor(Date.now() / 1000));
    log("ผู้กำกับ", t("เข้าช่วง") + ` ${i + 1}: ${segments[i].title}`);
    const next = products.find((p) => p.id === segments[i].productId) ?? null;
    if (liveRef.current) enqueue({
      event: { type: "graphic", preset: kit?.moments.transition || "iris-swap", data: { kicker: "ต่อไป", text: segments[i].title, ...productData(next), name: next?.name ?? segments[i].title }, x: 0.5, y: 0.5, theme: kit?.theme.look, ttl: 1800 },
      key: "transition", role: "Motion", text: t("เปลี่ยนช่วง") + " · " + segments[i].title,
    });
  }

  // ---------- speech ----------
  function startSpeech() {
    const Ctor = speechCtor();
    if (!Ctor) { setSpeech("unsupported"); log("ซับ", t("เบราว์เซอร์นี้ถอดเสียงไม่ได้ ใช้ Google Chrome"), "warn"); return; }
    const rec = new Ctor();
    let blocked = false;
    rec.lang = plan.style.language === "en" ? "en-US" : "th-TH";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => latest.current?.speech(e);
    rec.onerror = (e) => {
      if (!["not-allowed", "service-not-allowed", "audio-capture"].includes(e.error)) return;
      blocked = true;
      setSpeech("error");
      latest.current?.log("ซับ", t("เปิดไมค์ไม่ได้") + ": " + e.error, "error");
    };
    rec.onend = () => {
      if (blocked || !liveRef.current || recRef.current !== rec) return;
      setTimeout(() => { if (liveRef.current && recRef.current === rec) try { rec.start(); } catch { /* already running */ } }, 250);
    };
    recRef.current = rec;
    try { rec.start(); setSpeech("on"); } catch (error) { setSpeech("error"); log("ซับ", message(error), "error"); }
  }
  function stopSpeech() {
    const rec = recRef.current;
    recRef.current = null;
    rec?.abort();
    setSpeech((s) => (s === "unsupported" ? s : "off"));
    setInterim("");
  }
  function onSpeech(e: SpeechEvent) {
    let pending = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      const text = result[0].transcript.trim();
      if (!result.isFinal) { pending += result[0].transcript; continue; }
      if (!text) continue;
      finals.current = [...finals.current.filter((f) => Date.now() - f.at < 10000), { text, at: Date.now() }];
      setLines((l) => [...l.slice(-7), text]);
      onKeywords(text);
    }
    setInterim(pending);
  }
  function onKeywords(text: string) {
    const p = current;
    for (const hit of keywordHits(text)) {
      let event: OverlayEvent;
      let label: string = hit.kind;
      if (hit.kind === "price_drop") {
        const [a, b] = hit.nums.length > 1 ? [Math.max(...hit.nums), Math.min(...hit.nums)] : [p?.price ?? 0, hit.nums[0] ?? 0];
        if (a > b && b > 0) { event = buildEvent("price_drop", p, { from: a, to: b }); if (p) discount.current = { id: p.id, from: a, to: b }; }
        else { event = buildEvent("price_pop", p, { name: "ลดพิเศษ" + (p ? " · " + p.name : "") }); label = "price_pop"; }
      } else if (hit.kind === "price_pop") event = buildEvent("price_pop", p, { price: hit.nums[0] });
      else if (hit.kind === "free_badge") event = buildEvent("free_badge", p, { text: hit.text, sub: p?.name });
      else if (hit.kind === "low_stock") event = buildEvent("low_stock", p, { left: hit.nums[0] ?? (/ชิ้นสุดท้าย|last one/i.test(text) ? 1 : 3) });
      else event = buildEvent("zoom", p);
      enqueue({ event, key: label, role: roleFor(label), text: describe(label, p) + ` · "${text.slice(0, 32)}"` }, 4000);
    }
  }

  // ---------- Decisions AI ----------
  async function decide() {
    const shot = frame.current;
    if (!shot || inFlight.current || shot.at <= lastFrameSent.current || Date.now() - shot.at > 3000) return;
    inFlight.current = true;
    lastFrameSent.current = shot.at;
    lastDecideAt.current = Date.now();
    const motions = [
      ...(kit ? Object.entries(kit.moments).map(([moment, id]) => ({ id, description: MOMENT_NOTES[moment] ?? moment })) : []),
      ...GENERAL_MOTIONS.map(([id, description]) => ({ id, description })),
    ].filter((m, i, all) => m.id && all.findIndex((x) => x.id === m.id) === i);
    const started = performance.now();
    try {
      const decision = await director.decide({
        image: shot.image,
        transcript: finals.current.filter((f) => Date.now() - f.at < 10000).map((f) => f.text).join(" "),
        products: pool.map(({ id, name, description, distinct }) => ({ id, name, description, distinct })),
        current: current?.name ?? null,
        motions,
      });
      latest.current?.decision(decision, Math.round(performance.now() - started));
    } catch (error) {
      setAi((a) => ({ ...a, error: message(error) }));
      latest.current?.log("ผู้กำกับ", t("Decisions AI ผิดพลาด ไลฟ์ยังเดินต่อ") + ": " + message(error), "error");
    } finally {
      inFlight.current = false;
    }
  }
  function onDecision(d: Decision, rtt: number) {
    setAi({ latency: rtt, error: "" });
    if (!liveRef.current) return;
    const p = pool.find((x) => x.id === d.product || x.name === d.product) ?? current;
    if (d.product && d.product !== lastAiProduct.current && (d.productConfidence ?? 0) > 0.6) {
      lastAiProduct.current = d.product;
      log("ผู้กำกับ", t("AI เห็นสินค้า") + ` · ${p?.name ?? d.product} (${pct(d.productConfidence)})`);
    }
    if ((d.riskyClaim ?? 0) > 0.7) {
      setWarning({ text: lines.at(-1) ?? "", at: Date.now() });
      log("โปรดิวเซอร์", t("เตือน: คำพูดเกินจริง") + ` (${pct(d.riskyClaim)})`, "warn");
    }
    lowEnergy.current = d.energy === "low" ? lowEnergy.current + 1 : 0;
    if (lowEnergy.current === 2) { setSuggestPoll(true); log("ผู้กำกับ", t("คนดูเริ่มเงียบ แนะนำเปิดโหวต"), "warn"); }

    if (d.teamCommand && d.teamCommand !== "none") {
      log("ผู้กำกับ", t("ทีมสั่งด้วยเสียง") + " · " + t(LABEL[d.teamCommand as Kind] ?? (d.teamCommand === "dead_air_clip" ? "เปิดคลิปกันเงียบ" : "ช่วงถัดไป")), "action");
      if (d.teamCommand === "dead_air_clip") playClip();
      else if (d.teamCommand === "next_segment") goSegment(segIndex + 1);
      else if (d.teamCommand === "product_card") showProductNow(p);
      else now(d.teamCommand, p);
      return;
    }
    if (d.motion && d.motion !== "none" && (d.motionConfidence ?? 0) >= 0.5) {
      const text = (lines.at(-1) ?? p?.name ?? "").slice(0, 40);
      enqueue({
        event: { type: "graphic", preset: d.motion, data: { ...productData(p), text }, ...placement(), image: p ? imageUrl(p) : undefined, theme: kit?.theme.look, ttl: 2200 },
        key: d.motion, role: "Motion", text: t("เลือก") + ` ${d.motion} (${t("มั่นใจ")} ${pct(d.motionConfidence)})` + (p ? " · " + p.name : ""),
      }, 8000);
      return;
    }
    if (d.action === "none" || (d.actionConfidence ?? 1) < 0.5) return;
    if (d.action === "product_card") {
      if ((d.heldUp ?? 0) > 0.8 && (d.productConfidence ?? 0) > 0.7 && p) {
        const { event, label } = productEvent(p);
        enqueue({ event, key: "product_card", role: "Motion", text: describe(label, p) }, 8000);
      }
      return;
    }
    const kind = d.action as Kind;
    enqueue({ event: kind === "low_stock" ? buildEvent(kind, p, { left: stock[p?.id ?? ""] ?? 3 }) : buildEvent(kind, p), key: kind, role: roleFor(kind), text: describe(kind, p) }, 8000);
  }

  // ---------- detector bridge ----------
  function onBridge(m: BridgeMessage) {
    setDetectorUp(true);
    if (m.type === "state") {
      setDetect((d) => ({ ...d, running: m.running, products: m.products ?? d.products }));
      if (!m.running) setBox(null);
      if (!m.running && m.reason && liveRef.current) log("ผู้กำกับ", t("ตัวตรวจจับหยุด") + ": " + m.reason, "warn");
    } else if (m.type === "detect") {
      setDetect((d) => ({ ...d, latency: m.latencyMs, name: m.name, confidence: m.confidence }));
      if (m.confirmed && m.confirmed !== lastConfirmed.current) {
        lastConfirmed.current = m.confirmed;
        log("ผู้กำกับ", t("กล้องจับสินค้าได้") + ` · ${m.name} ${pct(m.confidence)}`);
      }
    } else if (m.type === "box") setBox(m.box);
    else if (m.type === "frame") frame.current = { image: m.image, at: Date.now() };
  }

  // ---------- demo chat ----------
  function chatStep(): number {
    const r = rng.current;
    const pick = <T,>(list: T[]) => list[Math.floor(r() * list.length)];
    const add = (name: string, text: string, kind: ChatItem["kind"]) => {
      const id = ++chatId.current;
      setChat((items) => [...items.slice(-24), { id, name, text, kind }]);
    };
    const name = pick(NAMES);
    setViewers((v) => Math.max(80, v + Math.floor(r() * 16) - 4));
    const roll = r();
    if (roll < 0.06) {
      const count = 4 + Math.floor(r() * 4);
      for (let i = 0; i < count; i++) add(pick(NAMES), "", "heart");
      send({ type: "sound", name: "heart" });
      enqueue({ event: { type: "combo", payload: { count, text: "หัวใจรัว ๆ" }, ttl: 1800 }, key: "combo", role: "Motion", text: t("คอมโบหัวใจ") + ` ×${count}` }, 12000);
      return 900;
    }
    if (roll < 0.3) add(name, pick(HELLO), "chat");
    else if (roll < 0.52 && current) add(name, pick(ASK(current.name)), "chat");
    else if (roll < 0.74 && pool.length) {
      const target = r() < 0.7 && current ? current : pick(pool);
      const before = stock[target.id] ?? STOCK;
      if (before <= 0) add(name, `${target.name} หมดแล้วเหรอคะ`, "chat");
      else {
        const qty = Math.min(before, 1 + Math.floor(r() * 3));
        const left = before - qty;
        setStock((s) => ({ ...s, [target.id]: left }));
        add(name, `CF ${target.id} ${qty} ชิ้น`, "cf");
        lastCf.current = { name, qty, product: target.name };
        const milestone = Math.floor((sold.current + qty) / 10) > Math.floor(sold.current / 10);
        sold.current += qty;
        if (milestone) enqueue({ event: { type: "fireworks", payload: { text: `ขายแล้ว ${sold.current} ชิ้น` }, ttl: 2600 }, key: "fireworks", role: "Motion", text: t("พลุฉลองยอดขาย") + ` · ${sold.current}` });
        send({ type: "cf_toast", payload: { name, product: target.name, qty, left }, ttl: 2600 });
        log("โปรดิวเซอร์", `CF · ${name} ${target.name} ×${qty} (${t("เหลือ")} ${left})`, "action");
        if (left <= 3) enqueue({ event: { type: "low_stock", payload: { left, total: STOCK, name: target.name }, ttl: 2600 }, key: "low_stock:" + target.id, role: "Motion", text: t("ป้ายเหลือน้อย") + ` · ${target.name} (${left})` }, 6000);
      }
    } else add(name, "", "heart");
    return 1000 + r() * 2000;
  }

  // ---------- clock ----------
  function tick() {
    pump();
    const sec = Math.floor(Date.now() / 1000);
    setClock(sec);
    if (warning && Date.now() - warning.at > 8000) setWarning(null);
    if (!liveRef.current) return;
    if (segment) {
      const at = sec - segStartSec;
      segment.cues.forEach((cue, i) => {
        const key = `${segIndex}:${i}`;
        if (cue.at > at || firedCues.current.has(key)) return;
        firedCues.current.add(key);
        const event = cue.event === "caption" ? buildEvent("caption", current, { text: cue.note })
          : cue.event === "product_card" && current ? productEvent(current).event : buildEvent(cue.event, current);
        enqueue({ event, key: "cue:" + key, role: roleFor(cue.event), text: t("คิวสคริปต์") + " · " + describe(cue.event, current) + (cue.note ? ` · ${cue.note}` : "") });
      });
      if (at >= segment.seconds && segIndex < segments.length - 1) goSegment(segIndex + 1);
    }
    if (!inFlight.current && Date.now() - lastDecideAt.current >= DECIDE_EVERY) void decide();
    // director's rule: something visible changes every 6–10 s, even with no AI, speech or detection
    if (!queue.current.length && Date.now() - lastBig.current >= nextGap.current && Date.now() - lastSignal.current >= 4000) {
      const beat = engineBeat();
      if (beat) { play(beat); nextGap.current = 6000 + rng.current() * 4000; }
    }
  }

  /** The next beat of the always-on show engine: a varied playlist, never the same preset twice in a row. */
  function engineBeat(): Queued | null {
    const p = current;
    const at = placement();
    const demo = mode === "demo"; // simulated stock, buyers and reviews exist only in the demo; never fake them on air
    const r = rng.current;
    const g = (preset: string, data: Record<string, unknown>, label: string, extra: OverlayEvent = {}): Queued => ({
      event: { type: "graphic", preset, data, theme: kit?.theme.look, ttl: 2600, ...extra }, key: preset, role: "Motion",
      text: t("โชว์อัตโนมัติ") + " · " + t(label) + (p ? " · " + p.name : ""),
    });
    if (Date.now() - lastPoll.current > 45000 && lastPreset.current !== "poll") {
      lastPoll.current = Date.now();
      return { event: buildEvent("poll", p), key: "poll", role: "Motion", text: t("โชว์อัตโนมัติ") + " · " + t("เปิดโหวต") };
    }
    const claims = shortList(segment?.talkingPoints.length ? segment.talkingPoints : (p?.distinct || p?.description || "").split(/[\n,·•|]/));
    const said = [p?.description, p?.distinct, ...(segment?.talkingPoints ?? [])].join(" ");
    const deal = p && discount.current?.id === p.id ? discount.current : null;
    const playlist: (() => Queued | null)[] = [
      () => p && (at.box ? g("magnet-snap", productData(p), "การ์ดสินค้า", { ...at, image: imageUrl(p) }) : g(kit?.moments.productIn || "product-card", productData(p), "การ์ดสินค้า", { image: imageUrl(p) })),
      () => g("heart-burst", { count: 80 + Math.floor(r() * 400) }, "หัวใจลอย"),
      () => p && (deal ? g("price-countdown", { name: p.name, from: deal.from, to: deal.to }, "นับถอยหลังราคา") : g(kit?.moments.price || "price-pop", productData(p), "เด้งราคา")),
      () => (claims.length ? g("kinetic-claim", { claims }, "จุดเด่นสินค้า") : null),
      () => (demo && lastCf.current ? g("buyer-toast", lastCf.current, "แจ้งคนสั่งซื้อ") : null),
      () => (p ? g("cf-keycaps", { code: p.id }, "ชวนพิมพ์ CF") : null),
      () => (at.box ? g("callout-ring", { label: "ตัวนี้เลย!" }, "วงชี้สินค้า", at) : null),
      () => (demo || /ส่งฟรี|free ship/i.test(said) ? g("stamp-free-ship", {}, "ตราส่งฟรี", at.box ? { box: at.box } : {}) : null),
      () => (demo && p ? g("stock-bar", { name: p.name, left: stock[p.id] ?? STOCK, total: STOCK }, "แถบสต็อก") : null),
      () => (kit && segment?.callToAction ? g(kit.moments.callToAction, { ...productData(p), text: segment.callToAction }, "เชิญชวนสั่งซื้อ") : null),
      () => (demo ? g("stamp-bestseller", {}, "ตราขายดี") : null),
      () => (demo ? g("review-stars", { rating: 4.9, count: 1200 + Math.floor(r() * 900), quote: REVIEWS[Math.floor(r() * REVIEWS.length)] }, "ดาวรีวิว") : null),
    ];
    for (let n = 0; n < playlist.length; n++) {
      const beat = playlist[beatIndex.current++ % playlist.length]();
      if (beat && beat.key !== lastPreset.current) return beat;
    }
    return null;
  }

  useEffect(() => { latest.current = { tick, bridge: onBridge, speech: onSpeech, chat: chatStep, decision: onDecision, log }; });

  // ---------- go live / end ----------
  function goLive() {
    const sec = Math.floor(Date.now() / 1000);
    liveRef.current = true;
    setLive(true);
    setStartSec(sec);
    setSegStartSec(sec);
    setClock(sec);
    firedCues.current.clear();
    queue.current = [];
    lowEnergy.current = 0;
    finals.current = [];
    setSuggestPoll(false);
    if (mode === "demo") { setChat([]); setStock({}); setViewers(1240); sold.current = 0; lastCf.current = null; }
    commandDetect(detectRef.current, DETECT_ORIGIN, "start");
    startSpeech();
    send({ type: "theme", payload: { accent: kit?.theme.accent ?? plan.style.accent, accent2: kit?.theme.accent2 ?? plan.style.accent2, font: plan.style.font || undefined } });
    log("ผู้กำกับ", t(mode === "demo" ? "เริ่มไลฟ์จำลอง ทุกคนประจำที่" : "ออนแอร์ ทุกคนประจำที่"), "action");
    const shop = plan.style.shop || "SnapPromo";
    lastBig.current = 0;
    lastSignal.current = 0;
    lastPoll.current = Date.now();
    nextGap.current = 6000;
    play({
      event: { type: "graphic", preset: kit?.moments.intro || "blinds-sting", data: { text: kit?.sting.headline || shop, sub: kit?.sting.kicker, kicker: "LIVE", title: kit?.sting.headline || shop, name: shop }, theme: kit?.theme.look, ttl: 2400 },
      key: "intro", role: "Motion", text: t("เปิดไลฟ์") + " · " + (kit?.sting.headline || shop),
    });
  }
  function endLive() {
    liveRef.current = false;
    setLive(false);
    commandDetect(detectRef.current, DETECT_ORIGIN, "stop");
    stopSpeech();
    queue.current = [];
    send({ type: "zoom_out" });
    setBox(null);
    log("ผู้กำกับ", t("จบไลฟ์") + " · " + timecode(elapsed), "action");
  }
  function chooseMode(next: Mode) {
    setMode(next);
    try { localStorage.setItem(MODE_KEY, next); } catch { /* optional */ }
  }
  async function makeObsLink() {
    setObsBusy(true);
    try {
      const link = await studioPost<{ path: string }>("/agent/overlay/link", {});
      setObsConnected(0);
      setObsUrl(new URL(link.path, overlayOrigin).href);
      setCopied(false);
    } catch (error) {
      log("โปรดิวเซอร์", t("สร้างลิงก์ OBS ไม่สำเร็จ") + ": " + message(error), "error");
    } finally {
      setObsBusy(false);
    }
  }

  // ---------- view ----------
  const view = box ? toView(box) : null;
  const rows: { icon: typeof Radio; label: string; status: Status; detail: string }[] = [
    {
      icon: MonitorPlay, label: "OBS Browser Source",
      status: mode === "demo" ? "off" : obsConnected == null ? "err" : obsConnected > 0 ? "ok" : "warn",
      detail: mode === "demo" ? t("โหมดจำลอง ไม่ส่งไป OBS") : obsConnected == null ? t("เช็กสถานะไม่ได้") : obsConnected > 0 ? t("เชื่อมต่อแล้ว") + ` ${obsConnected} ${t("จอ")}` : t("รอ Browser Source เชื่อมต่อ"),
    },
    { icon: Camera, label: t("กล้อง"), status: cameraError ? "err" : activeCamera ? "ok" : "warn", detail: cameraError ? t(cameraError) : activeCamera?.label || t("กำลังเปิดกล้อง…") },
    {
      icon: ScanSearch, label: t("ตรวจจับสินค้า"),
      status: detectorUp === false ? "err" : detect.running ? "ok" : detectorUp ? "warn" : "off",
      detail: detectorUp === false ? t("บริการตรวจจับไม่ตอบ") : detect.running
        ? [t("กำลังตรวจ"), detect.latency != null && `${detect.latency} ms`, detect.name && `${detect.name} ${pct(detect.confidence)}`].filter(Boolean).join(" · ")
        : t("พร้อม รอ GO LIVE"),
    },
    {
      icon: BrainCircuit, label: "Decisions AI",
      status: ai.error ? "err" : live && ai.latency != null ? "ok" : live ? "warn" : "off",
      detail: ai.error ? ai.error : ai.latency != null ? `${ai.latency} ms ${t("ต่อการตัดสินใจ")}` : t(live ? "รอเฟรมจากตัวตรวจจับ" : "รอ GO LIVE"),
    },
    {
      icon: Mic, label: t("ไมค์ถอดเสียง"),
      status: speech === "on" ? "ok" : speech === "off" ? "off" : "err",
      detail: t(speech === "on" ? "กำลังฟัง" : speech === "unsupported" ? "ใช้ได้เฉพาะ Google Chrome" : speech === "error" ? "เปิดไมค์ไม่ได้" : "รอ GO LIVE"),
    },
  ];
  const allGood = rows.every((r) => r.status === "ok" || r.status === "off");

  return <section className="cr" data-mode={mode} data-live={live || undefined} aria-label={t("ห้องควบคุมไลฟ์")}>
    <header className="cr-bar">
      <div className="cr-tally" role="status" aria-live="polite">
        <span className="cr-tally-light">{live ? "ON AIR" : "STANDBY"}</span>
        <span className="cr-timecode">{timecode(elapsed)}</span>
      </div>
      <div className="cr-modes" role="group" aria-label={t("โหมดไลฟ์")}>
        <button type="button" aria-pressed={mode === "obs"} disabled={live} onClick={() => chooseMode("obs")}><MonitorPlay size={15} aria-hidden />OBS</button>
        <button type="button" aria-pressed={mode === "demo"} disabled={live} onClick={() => chooseMode("demo")}><Smartphone size={15} aria-hidden />{t("จำลองไลฟ์ (Demo)")}</button>
      </div>
      <p className="cr-bar-note">{t(allGood ? "ทุกระบบพร้อม" : "มีระบบที่ยังไม่พร้อม ดูแผงเชื่อมต่อ")}</p>
      {live
        ? <button type="button" className="cr-go cr-end" onClick={endLive}>{t("จบไลฟ์")}</button>
        : <button type="button" className="cr-go" onClick={goLive}><Radio size={18} aria-hidden />GO LIVE</button>}
    </header>

    {!products.length && <p className="cr-hint">{t("ยังไม่มีสินค้าในคลัง เพิ่มได้ที่ขั้นตอน 1 คลังสินค้า (แถบขั้นตอนด้านบน)")}</p>}
    {products.length > 0 && !lineup.length && <p className="cr-hint">{t("ยังไม่ได้เลือกสินค้าเข้าไลฟ์ เลือกได้ที่ขั้นตอน 2 สไตล์และลำดับไลฟ์")}</p>}
    {warning && <div className="cr-warning" role="alert"><TriangleAlert size={18} aria-hidden />
      <div><strong>{t("ระวังคำพูดเกินจริง (เห็นเฉพาะจอนี้ ไม่ขึ้นไลฟ์)")}</strong>{warning.text && <span>“{warning.text}”</span>}</div>
      <button type="button" className="cr-btn" onClick={() => setWarning(null)}>{t("รับทราบ")}</button>
    </div>}
    {suggestPoll && <div className="cr-suggest" role="status"><span>{t("ผู้กำกับ: คนดูเริ่มเงียบ แนะนำเปิดโหวต")}</span>
      <button type="button" className="cr-btn cr-btn-accent" onClick={() => { now("poll", current); setSuggestPoll(false); }}><Vote size={15} aria-hidden />{t("เปิดโหวต")}</button>
      <button type="button" className="cr-btn" onClick={() => setSuggestPoll(false)}>{t("ปิด")}</button>
    </div>}

    <div className="cr-grid">
      <div className="cr-main">
        <div className="cr-stage cr-area-stage" data-mode={mode}>
          <div className="cr-screen">
            <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={(e) => setVideoAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9)} />
            {view && <div className="cr-box" style={{ left: `${view.x * 100}%`, top: `${view.y * 100}%`, width: `${view.w * 100}%`, height: `${view.h * 100}%` }}>
              <span>{detect.name || t("สินค้า")}</span>
            </div>}
            <iframe ref={previewRef} src={PREVIEW_SRC} title={t("ภาพ overlay แบบเดียวกับใน OBS")} tabIndex={-1} aria-hidden />
            {cameraError && <p className="cr-screen-msg"><Camera size={20} aria-hidden />{t(cameraError)}</p>}
            {mode === "obs" ? <>
              <span className="cr-chip cr-chip-pgm">PGM</span>
              {live && <span className="cr-chip cr-chip-live">LIVE {timecode(elapsed)}</span>}
            </> : <>
              <div className="cr-ph-top">
                <span className="cr-ph-avatar" aria-hidden>{(plan.style.shop || "S").slice(0, 1)}</span>
                <span className="cr-ph-shop">{plan.style.shop || "SnapPromo"}</span>
                <span className="cr-ph-live">LIVE</span>
                <span className="cr-ph-viewers"><Eye size={12} aria-hidden />{viewers.toLocaleString("th-TH")}</span>
              </div>
              <ol className="cr-chat" aria-label={t("แชทจำลอง")}>
                {!live && <li className="cr-chat-idle">{t("แชทจะเริ่มเมื่อกด GO LIVE")}</li>}
                {chat.map((c) => <li key={c.id} data-kind={c.kind}><b>{c.name}</b>{c.kind === "heart" ? <> <Heart size={12} aria-label={t("ส่งหัวใจ")} /></> : " " + c.text}</li>)}
              </ol>
              <div className="cr-hearts" aria-hidden>
                {chat.filter((c) => c.kind === "heart").slice(-10).map((c) => <Heart key={c.id} size={22} fill="currentColor" data-hue={c.id % 3} style={{ right: `${8 + ((c.id * 37) % 28)}px` }} />)}
              </div>
              {current && <div className="cr-pin">
                {/* eslint-disable-next-line @next/next/no-img-element -- detection-service image through a rewrite */}
                {current.images[0] && <img src={productImage(current.images[0])} alt="" />}
                <div><strong>{current.name}</strong><span>{baht(current.price)} · {t("เหลือ")} {stock[current.id] ?? STOCK}</span></div>
                <span className="cr-pin-cart"><ShoppingCart size={13} aria-hidden />{t("กดตะกร้า")}</span>
              </div>}
            </>}
          </div>
          <div className="cr-stage-bar">
            <label><Camera size={14} aria-hidden /><span className="cr-sr">{t("กล้อง")}</span>
              <select value={deviceId || activeCamera?.id || ""} onChange={(e) => setDeviceId(e.target.value)} aria-label={t("เลือกกล้องของจอมอนิเตอร์")}>
                {!cameras.length && <option value="">{t("กล้องเริ่มต้น")}</option>}
                {cameras.map((c, i) => <option key={c.deviceId || i} value={c.deviceId}>{c.label || `${t("กล้อง")} ${i + 1}`}</option>)}
              </select>
            </label>
            <span>{mode === "obs" ? t("จอนี้แสดงภาพเดียวกับที่ OBS ออกอากาศ") : t("ไลฟ์จำลองบนจอนี้ ไม่ส่งไป OBS")}</span>
          </div>
        </div>

        <section className="cr-panel cr-area-actions" aria-label={t("ปุ่มลัดของโฮสต์")}>
          <h3>{t("ปุ่มลัด")}</h3>
          <div className="cr-actions">
            <button type="button" className="cr-btn" disabled={!current} onClick={() => now("price_pop", current)}><Tag size={15} aria-hidden />{t("เด้งราคา")}{current && ` ${baht(current.price)}`}</button>
            <button type="button" className="cr-btn" data-suggested={suggestPoll || undefined} onClick={() => now("poll", current)}><Vote size={15} aria-hidden />{t("โหวต")}</button>
            <button type="button" className="cr-btn" onClick={() => now("fireworks", current)}><PartyPopper size={15} aria-hidden />{t("พลุ")}</button>
            <button type="button" className="cr-btn" onClick={() => now("zoom", current)}><ZoomIn size={15} aria-hidden />{t("ซูม")}</button>
            <button type="button" className="cr-btn" onClick={() => { send({ type: "zoom_out" }); log("คนตัดต่อ", t("ล้างจอ"), "action"); }}><Eraser size={15} aria-hidden />{t("ล้างจอ")}</button>
            <span className="cr-spot">
              <select aria-label={t("สินค้าที่จะโชว์")} value={spotId || current?.id || ""} onChange={(e) => setSpotId(e.target.value)}>
                {pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button type="button" className="cr-btn" disabled={!pool.length} onClick={() => showProductNow(pool.find((p) => p.id === (spotId || current?.id)) ?? null)}><Crosshair size={15} aria-hidden />{t("โชว์สินค้า")}</button>
            </span>
          </div>
          <div className="cr-actions">
            {plan.clips.length ? plan.clips.map((clip) => <button key={clip.fileId} type="button" className="cr-btn" onClick={() => {
              send({ type: "clip", fileId: clip.fileId });
              log("คนตัดต่อ", t("เปิดคลิปกันเงียบ") + " · " + clip.name, "action");
            }}><Film size={15} aria-hidden />{clip.name}</button>) : <p className="cr-quiet">{t("ยังไม่มีคลิปกันเงียบ เตรียมได้ที่ขั้นตอน 3")}</p>}
          </div>
        </section>

        <section className="cr-panel cr-script cr-area-prompter" aria-label={t("สคริปต์ผู้กำกับ")}>
          <h3>{t("สคริปต์ผู้กำกับ")}{plan.script && <span className="cr-quiet"> · {plan.script.title}</span>}</h3>
          {!plan.script && segment && <p className="cr-quiet">{t("ลำดับอัตโนมัติจากรายการสินค้า ให้ AI เขียนสคริปต์เต็มได้ที่ขั้นตอน 3")}</p>}
          {!segment ? <p className="cr-quiet">{t("ยังไม่มีสคริปต์ ให้ AI เขียนได้ที่ขั้นตอน 3 เตรียมคลิปและ motion")}</p> : <div className="cr-script-body">
            <ol className="cr-rundown">
              {segments.map((s, i) => <li key={i} aria-current={i === segIndex ? "step" : undefined} data-done={i < segIndex || undefined}>
                <button type="button" onClick={() => goSegment(i)}>
                  <span className="cr-run-num">{i + 1}</span><span className="cr-run-title">{s.title}</span>
                  <span className="cr-run-time">{i === segIndex ? mmss(remaining) : mmss(s.seconds)}</span>
                </button>
              </li>)}
            </ol>
            <div className="cr-prompter">
              <div className="cr-prompter-head">
                <span className="cr-countdown" data-late={remaining <= 10 || undefined} aria-label={t("เวลาที่เหลือของช่วงนี้")}>{mmss(remaining)}</span>
                <button type="button" className="cr-btn" onClick={() => goSegment(segIndex - 1)} disabled={segIndex === 0}><ChevronLeft size={15} aria-hidden />{t("ย้อนกลับ")}</button>
                <button type="button" className="cr-btn" onClick={() => goSegment(segIndex + 1)} disabled={segIndex >= segments.length - 1}>{t("ถัดไป")}<ChevronRight size={15} aria-hidden /></button>
              </div>
              <p className="cr-opening">{segment.opening}</p>
              {segment.talkingPoints.length > 0 && <ul>{segment.talkingPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>}
              {segment.callToAction && <p className="cr-cta">{segment.callToAction}</p>}
              {segment.cues.length > 0 && <p className="cr-cues">{segment.cues.map((c, i) => <span key={i} data-fired={firedCues.current.has(`${segIndex}:${i}`) || undefined}>{mmss(c.at)} {t(LABEL[c.event])}</span>)}</p>}
            </div>
          </div>}
        </section>
      </div>

      <aside className="cr-side">
        <section className="cr-panel cr-area-status" aria-label={t("เชื่อมต่อ")}>
          <h3>{t("เชื่อมต่อ")}</h3>
          <ul className="cr-rows">
            {rows.map((r) => <li key={r.label} data-status={r.status} title={r.detail}>
              <span className="cr-dot" aria-hidden /><r.icon size={16} aria-hidden />
              <span className="cr-row-label">{r.label}</span>
              <span className="cr-row-detail">{r.detail}</span>
              <span className="cr-sr">{r.status}</span>
            </li>)}
          </ul>
          {mode === "obs" && <div className="cr-obs-link">
            <button type="button" className="cr-btn" disabled={obsBusy} onClick={() => void makeObsLink()}><Link2 size={15} aria-hidden />{t("สร้างลิงก์ OBS ใหม่ (แทนลิงก์เดิม)")}</button>
            {obsUrl && <div className="cr-url">
              <input aria-label="OBS Browser Source URL" readOnly value={obsUrl} onFocus={(e) => e.target.select()} />
              <button type="button" className="cr-btn" onClick={() => void navigator.clipboard.writeText(obsUrl).then(() => setCopied(true))}><Copy size={15} aria-hidden />{t(copied ? "คัดลอกแล้ว" : "คัดลอก")}</button>
            </div>}
            {obsUrl && <p className="cr-quiet">{t("วางใน OBS → Browser Source ขนาด 1920 × 1080")}</p>}
          </div>}
        </section>

        <section className="cr-panel cr-area-transcript" aria-label={t("ถอดเสียงสด")}>
          <h3><Mic size={14} aria-hidden />{t("ถอดเสียงสด")}</h3>
          <p className="cr-transcript" aria-live="off">
            {lines.length || interim ? <>{lines.slice(-4).join(" ")} <span className="cr-interim">{interim}</span></>
              : <span className="cr-quiet">{t(speech === "unsupported" ? "การถอดเสียงใช้ได้เฉพาะ Google Chrome" : "ข้อความที่พูดจะขึ้นที่นี่เมื่อกด GO LIVE")}</span>}
          </p>
        </section>

        <section className="cr-panel cr-area-crew" aria-label={t("ทีมงาน")}>
          <h3>{t("ทีมงาน")}</h3>
          <ol className="cr-feed" aria-live="polite">
            {!feed.length && <li className="cr-quiet">{t("การตัดสินใจของทีม AI จะขึ้นที่นี่")}</li>}
            {feed.map((f) => <li key={f.id} data-tone={f.tone}>
              <time>{f.time}</time><span className="cr-role" data-role={f.role}>{t(f.role)}</span>
              <span>{f.text}{f.count > 1 && <span className="cr-quiet"> ×{f.count}</span>}</span>
            </li>)}
          </ol>
        </section>

        <section className="cr-panel cr-area-detector" aria-label={t("ตัวตรวจจับ")}>
          <h3>
            <button type="button" className="cr-collapse" aria-expanded={detectorOpen} aria-controls="cr-detector" onClick={() => setDetectorOpen((o) => !o)}>
              <ScanSearch size={14} aria-hidden />{t("ตัวตรวจจับ")}<ChevronRight size={14} aria-hidden />
            </button>
          </h3>
          <p className="cr-quiet">{t(mode === "demo" ? "เลือกแหล่งภาพ \"กล้อง\" ในตัวตรวจจับ ใช้เว็บแคมเดียวกับไลฟ์จำลองได้" : "เลือกแหล่งภาพในตัวตรวจจับ เช่น OBS Virtual Camera แล้วกด GO LIVE")}</p>
          {detectorUp === false ? <div className="cr-down">
            <p>{t("เปิดบริการตรวจจับสินค้าไม่ได้ที่")} <code>{DETECT_ORIGIN}</code></p>
            <p>{t("รันในเทอร์มินัล:")} <code>cd demo &amp;&amp; npm run dev</code></p>
            <button type="button" className="cr-btn" onClick={pingDetector}><RotateCw size={15} aria-hidden />{t("ลองเชื่อมต่ออีกครั้ง")}</button>
          </div> : detectSrc && <iframe
            id="cr-detector" ref={detectRef} className="cr-detector" data-open={detectorOpen || undefined} src={detectSrc}
            title={t("ตัวตรวจจับสินค้า")} allow="camera; microphone; display-capture"
          />}
        </section>
      </aside>
    </div>
  </section>;
}
