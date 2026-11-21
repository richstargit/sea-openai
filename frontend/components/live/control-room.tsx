"use client";

import { STAGE_LABEL } from "@/components/studio/live-script/labels";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit, Camera, Check, CircleAlert, Copy, Crosshair, Eraser, Eye, Film, Link2, Mic,
  MonitorPlay, PartyPopper, Radio, SlidersHorizontal, Smartphone, Square, Tag, TriangleAlert, Vote, X, ZoomIn,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { playOverlay, studioPost, studioRequest } from "@/components/studio/studio-api";
import { useLiveDetection } from "@/lib/live-detect";
import { useFaceBox } from "@/lib/live-face";
import { type LiveSentence, useLiveSpeech } from "@/lib/live-speech";
import { type CustomMotion, type Decision, type LiveProduct, type Segment, productImage, fillMotion, motionOn } from "@/lib/live-plan";
import { cuesFromSpeech, namesProduct } from "@/lib/live-cues";
import { COMBO_MAIN, VFX_ACCENTS } from "@/lib/live-vfx";
import type { StepProps } from "./live-studio";
import { buildShow } from "./product-shows";
import { ReplyBox } from "@/components/studio/live-script/reply-box";
import { type Suggestion, liveApi } from "@/components/studio/live-script/api";
import "@/components/studio/video/video.css";
import "@/components/studio/live-script/live-script.css";
import "./control-room.css";

// The live control room, built around one button: the live frame (camera + the same overlay OBS shows), the host's
// prompter and quick actions beside it, and everything else (connections, transcript, AI crew, camera, OBS link) in
// one "system details" sheet. Detection runs in this page (useLiveDetection) on the frame's own <video>. Two modes:
// Local preview (the real camera + overlay on this screen only) and OBS (every event also goes to the Browser Source).
// Nothing here is simulated: motion comes only from a verified product, the host's speech, Decisions, or a host tap.

type Box = { x: number; y: number; w: number; h: number };
type Kind = "price_pop" | "price_drop" | "free_badge" | "low_stock" | "product_card" | "poll" | "fireworks" | "zoom" | "caption";
type OverlayEvent = Record<string, unknown>;
type Role = "ผู้กำกับ" | "Motion" | "ซับ" | "โปรดิวเซอร์" | "คนตัดต่อ";
type Tone = "info" | "action" | "warn" | "error";
type FeedItem = { id: number; time: string; role: Role; text: string; tone: Tone; count: number };
type Mode = "obs" | "local";
type Status = "ok" | "warn" | "err" | "off";
type Queued = { event: OverlayEvent; key: string; role: Role; text: string; layers?: OverlayEvent[] };
type Combo = { main: string | null; accent: string | null; caption: string | null };
/** Captions end on a whole word (Thai has no spaces), never mid-word. */
function shortCaption(text: string, max = 22): string {
  if (text.length <= max) return text;
  let out = "";
  for (const { segment } of new Intl.Segmenter("th", { granularity: "word" }).segment(text)) { if ((out + segment).length > max) break; out += segment; }
  return out.trim() || text.slice(0, max);
}
const LAYER_STAGGER = 320; // combo layers land one after another, never as one hard cut
type Heard = { id: number; time: string; raw: string; corrected: string; product: string | null; motion: string | null; ms: number | null };


const PREVIEW_SRC = "/overlay/index.html?preview=1#" + "a".repeat(43); // index.html: "/overlay/" gets a trailing-slash redirect from Next
const MODE_KEY = "snappromo-live-mode";
const NEEDS_PRODUCT = /\{(name|price|code)\}/;
const BIG_GAP = 3500; // spec: at most one big motion per 3.5 s, the rest queue
const WINDOW_MS: [number, number] = [8000, 12000]; // the director decides once per window; nothing static for longer than this
const READ_MS = 2000; // spec: in 0.2–0.3 s, hold 1.5–2 s
const MOMENT_EVERY = 45000; // the camera gives the same product its card at most this often
const FRESH_SPEECH = 5000; // AI motion picks only fire right after the host said something
const GRACE = 2500; // a verified product stays verified this long after its box drops (tracking jitter)
const TOPIC = 8000; // a product the host just named is the topic this long (text-only graphics)
// Presets that show a product's name, price or photo; spotlight/callout/zoom also need its verified box.
const BOX_PRESETS = new Set(["spotlight", "callout-ring", "magnet-snap", "zoom"]);
const PRODUCT_PRESET = /^(product-card|magnet-snap|spotlight|callout-ring|price-|cf-keycaps|kinetic-claim)/;
type AiStatus = "idle" | "watching" | "confirming" | "verified" | "none";

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
  ["cf-keycaps", "ชวนพิมพ์ CF"], ["kinetic-claim", "ตัวหนังสือเน้นจุดเด่น"],
  ["callout-ring", "วงชี้สินค้า"], ["iris-swap", "เปลี่ยนสินค้า"],
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

const shortList = (items: string[]) => items.map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 18)).slice(0, 3);

const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, "0");
const timecode = (s: number) => `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
const baht = (n: number) => "฿" + n.toLocaleString("th-TH");
const pct = (n: number | null | undefined) => (n == null ? "" : Math.round(n * 100) + "%");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function ControlRoom({ plan, setPlan, products, overlayOrigin }: StepProps & { overlayOrigin: string }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("local");
  const [live, setLive] = useState(false);
  const [clock, setClock] = useState(0); // whole seconds, drives every timer on screen
  const [startSec, setStartSec] = useState(0);
  // the product the host is on: follows the camera and what they say, never a timer
  const [focusId, setFocusId] = useState<string | null>(null);
  const [heard, setHeard] = useState<Heard[]>([]); // newest first
  // camera
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [activeCamera, setActiveCamera] = useState<{ id: string; label: string } | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraTry, setCameraTry] = useState(0); // bump to reopen the camera after an error
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  // connections
  const [obsConnected, setObsConnected] = useState<number | null>(null);
  const [obsUrl, setObsUrl] = useState("");
  const [obsBusy, setObsBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  // director output
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [warning, setWarning] = useState<{ text: string; at: number } | null>(null);
  const [suggestPoll, setSuggestPoll] = useState(false);
  const [spotId, setSpotId] = useState("");
  const [ai, setAi] = useState<{ status: AiStatus; id: string | null }>({ status: "idle", id: null });
  const [reason, setReason] = useState("");
  const [nextLines, setNextLines] = useState<Suggestion[]>([]); // newest first
  const [nextHint, setNextHint] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const detailsClose = useRef<HTMLButtonElement>(null);
  const liveRef = useRef(false);
  const finals = useRef<{ text: string; at: number }[]>([]);
  const queue = useRef<Queued[]>([]);
  const lastBig = useRef(0);
  const lastByKey = useRef(new Map<string, number>());
  const focusRef = useRef<string | null>(null);
  const heardId = useRef(0);
  const lowEnergy = useRef(0);
  const lastConfirmed = useRef<string | null>(null);
  const lastDetectError = useRef<string | null>(null);
  const lastAiProduct = useRef<string | null>(null);
  const feedId = useRef(0);
  const discount = useRef<{ id: string; from: number; to: number } | null>(null);
  const verif = useRef<{ id: string; at: number } | null>(null);
  const spoken = useRef<{ id: string; at: number } | null>(null);
  const lastMoment = useRef(0);
  const lastCustom = useRef<Record<string, string>>({});
  // when each product last got its on-camera moment (follow-the-camera rule)
  const momentFor = useRef<Record<string, number>>({});
  const noneSince = useRef(0);
  const liveStart = useRef(0);
  const lastChange = useRef(0); // last play() or jump zoom: the frame is "static" since then
  const zoomClose = useRef(false);
  const faceSent = useRef<{ box: Box | null; at: number }>({ box: null, at: 0 });
  const win = useRef({ start: 0, length: 10000, heldMax: 0, heldId: null as string | null, low: 0, n: 0 });
  const [punch, setPunch] = useState<{ scale: number; x: number; y: number } | null>(null); // local preview "Close" shot
  const scriptSession = useRef<{ id: string; t0: number } | null>(null);
  const latest = useRef<{ tick: () => void; sentence: (s: LiveSentence) => void; decision: (d: Decision) => void; log: (role: Role, text: string, tone?: Tone) => void } | null>(null);

  // ---------- derived ----------
  const lineup = useMemo(() => plan.lineup.flatMap((item) => products.filter((p) => p.id === item.productId)), [plan.lineup, products]);
  const pool = lineup.length ? lineup : products;
  const current: LiveProduct | null = pool.find((p) => p.id === focusId) ?? lineup[0] ?? null;
  // what to say about the current product: the AI script's part for it, else its own points
  const segment: Segment | null = !current ? null : plan.script?.segments.find((x) => x.productId === current.id) ?? (() => {
    const item = plan.lineup.find((x) => x.productId === current.id);
    return { kind: "product", productId: current.id, title: current.name, seconds: 0, opening: `${current.name} ราคา ${baht(current.price)}`, talkingPoints: shortList((item?.points || current.distinct || current.description || "").split(/[\n,·•|]/)), callToAction: `พิมพ์ CF ${current.id} ได้เลย`, cues: [] };
  })();
  const elapsed = live ? clock - startSec : 0;
  const kit = plan.kit;
  const tagStyle = kit?.theme.tagStyle ?? plan.style.tagStyle;
  const motions = useMemo(() => [
    ...(kit ? Object.entries(kit.moments).filter(([moment]) => moment !== "celebrate").map(([moment, id]) => ({ id, description: MOMENT_NOTES[moment] ?? moment })) : []),
    ...(kit?.custom ?? []).map((m) => ({ id: "custom:" + m.id, description: `${MOMENT_NOTES[m.moment] ?? m.moment}: ${m.description}` })),
    ...GENERAL_MOTIONS.map(([id, description]) => ({ id, description })),
  ].filter((m) => motionOn(plan, m.id)).slice(0, 60).filter((m, i, all) => m.id && all.findIndex((x) => x.id === m.id) === i), [kit, plan]);
  // a motion the shop turned off in the motion library never plays; `fallback` is used when the kit's pick is off
  const pickOn = (id: string | undefined, fallback: string) => (id && motionOn(plan, id) ? id : fallback);

  // ---------- built-in detection: frames from videoRef, decisions + tracked box back ----------
  const transcript = useCallback(() => finals.current.filter((f) => Date.now() - f.at < 10000).map((f) => f.text).join(" "), []);
  const handleDecision = useCallback((d: Decision) => latest.current?.decision(d), []);
  const detection = useLiveDetection({ video: videoRef, enabled: live, products: pool, transcript, current: current?.name ?? null, motions, onDecision: handleDecision });
  // what the speech AI may pick for a combo: only motions the shop left on in the motion library
  const comboMenu = useMemo(() => ({
    main: COMBO_MAIN.filter(([id]) => motionOn(plan, id)).map(([id, description]) => ({ id, description })),
    accent: VFX_ACCENTS.filter(([id]) => motionOn(plan, id)).map(([id, description]) => ({ id, description })),
  }), [plan]);
  const hearing = useLiveSpeech({
    enabled: live, lang: plan.style.language === "en" ? "en" : "th",
    products: pool.map((p) => ({ id: p.id, name: p.name, price: p.price })), current: current?.name ?? null, motions: comboMenu,
    onSentence: (sentence) => latest.current?.sentence(sentence),
  });
  const speech = ({ listening: "on", off: "off", unsupported: "unsupported", error: "error" } as const)[hearing.status];
  const interim = hearing.interim;
  const box: Box | null = detection.box;
  const face = useFaceBox({ video: videoRef, enabled: live });
  const detectedName = products.find((p) => p.id === detection.product)?.name ?? detection.product ?? "";

  /** The one product the camera has really verified: confirmed by the detector AND boxed by the grounding model. */
  function verifiedProduct(): LiveProduct | null {
    const n = Date.now();
    if (liveRef.current && detection.product && detection.box) verif.current = { id: detection.product, at: n };
    const v = verif.current;
    return v && n - v.at < GRACE ? pool.find((p) => p.id === v.id) ?? null : null;
  }
  function spokenProduct(): LiveProduct | null {
    const s = spoken.current;
    return s && Date.now() - s.at < TOPIC ? pool.find((p) => p.id === s.id) ?? null : null;
  }
  const customNeedsProduct = (m: CustomMotion) => NEEDS_PRODUCT.test(JSON.stringify(m.layers));
  function customEventFor(m: CustomMotion, p: LiveProduct | null): OverlayEvent {
    return { type: "graphic", preset: "compose", data: { layers: fillMotion(m, { name: p?.name, price: p?.price, code: p?.id, shop: plan.style.shop }) }, theme: kit?.theme.look, ttl: Math.max(READ_MS, m.seconds * 1000), aiName: m.name };
  }
  /** The AI-designed motion for a kit moment: the kit's pick, else rotate through the moment's motions (never the same twice). */
  function customForMoment(moment: CustomMotion["moment"], p: LiveProduct | null): OverlayEvent | null {
    const list = (kit?.custom ?? []).filter((m) => m.moment === moment && motionOn(plan, "custom:" + m.id) && (p || !customNeedsProduct(m)));
    const picked = list.find((m) => "custom:" + m.id === kit?.moments[moment]);
    const last = lastCustom.current[moment];
    const m = picked ?? list[(list.findIndex((x) => x.id === last) + 1) % list.length];
    if (!m || (!picked && m.id === last)) { delete lastCustom.current[moment]; return null; }
    lastCustom.current[moment] = m.id;
    return customEventFor(m, p);
  }
  function needsProduct(preset: string) {
    if (preset.startsWith("custom:")) { const m = kit?.custom?.find((x) => "custom:" + x.id === preset); return !!m && customNeedsProduct(m); }
    return PRODUCT_PRESET.test(preset) || (!!kit && [kit.moments.productIn, kit.moments.price, kit.moments.deal, kit.moments.callToAction].includes(preset));
  }

  // ---------- setup ----------
  useEffect(() => {
    queueMicrotask(() => {
      try { const saved = localStorage.getItem(MODE_KEY); if (saved === "obs" || saved === "local") setMode(saved); } catch { /* optional */ }
    });
  }, []);
  // camera: on as soon as the room opens. OBS mode prefers OBS Virtual Camera (the monitor shows what OBS has);
  // local preview keeps the default webcam for the selfie view.
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
        if (mode === "obs" && !deviceId && obs && obs.deviceId !== track.getSettings().deviceId) setDeviceId(obs.deviceId);
      })
      .catch((error) => { if (!stopped) setCameraError(message(error)); });
    return () => { stopped = true; stream?.getTracks().forEach((track) => track.stop()); };
  }, [deviceId, mode, cameraTry]);

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

  useEffect(() => {
    const id = setInterval(() => latest.current?.tick(), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => { liveRef.current = false; }, []);

  // system details sheet: focus moves in on open; Escape closes it
  useEffect(() => {
    if (!detailsOpen) return;
    detailsClose.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDetailsOpen(false); detailsButton.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailsOpen]);
  function closeDetails() {
    setDetailsOpen(false);
    detailsButton.current?.focus();
  }

  // ---------- output ----------
  function log(role: Role, text: string, tone: Tone = "info") {
    if (tone === "action") setReason(`${role} · ${text}`);
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
  function enqueue(item: Queued, cooldown = 0): boolean {
    if (cooldown && Date.now() - (lastByKey.current.get(item.key) ?? -1e9) < cooldown) return false;
    if (queue.current.some((q) => q.key === item.key)) return false;
    queue.current.push(item);
    if (queue.current.length > 2) queue.current.shift(); // stale motions are dropped, never played late
    pump();
    return true;
  }
  function pump() {
    if (!queue.current.length || Date.now() - lastBig.current < BIG_GAP) return;
    play(queue.current.shift()!);
  }
  function play(item: Queued) {
    lastBig.current = lastChange.current = Date.now();
    lastByKey.current.set(item.key, Date.now());
    const { aiName, ...event } = item.event;
    send(event);
    item.layers?.forEach((layer, i) => setTimeout(() => { if (liveRef.current) send(layer); }, (i + 1) * LAYER_STAGGER));
    log(item.role, aiName ? `Motion · ${aiName} (${t("ออกแบบโดย AI")})` : item.text, "action");
  }

  // the monitor crops the camera (object-fit: cover) and mirrors it in local preview; map detector boxes onto it
  function toView(b: Box): Box {
    const container = 16 / 9;
    const sx = videoAspect > container ? videoAspect / container : 1;
    const sy = videoAspect > container ? 1 : container / videoAspect;
    const x = b.x * sx + (1 - sx) / 2, w = b.w * sx;
    return { x: mode === "local" ? 1 - x - w : x, y: b.y * sy + (1 - sy) / 2, w, h: b.h * sy };
  }
  // a box only belongs to the product the detector verified; never aim a graphic at another product's box
  function placement(p?: LiveProduct | null): { x?: number; y?: number; box?: Box } {
    if (!box || !p || detection.product !== p.id) return {};
    const b = mode === "local" ? toView(box) : box; // OBS gets camera coordinates, the local frame its own
    return { x: b.x + b.w / 2, y: b.y + b.h / 2, box: b };
  }
  const imageUrl = (p: LiveProduct) => (p.images[0] ? new URL(productImage(p.images[0]), window.location.origin).href : undefined);
  const productData = (p: LiveProduct | null) => (p ? { name: p.name, price: p.price, productId: p.id, style: tagStyle } : { style: tagStyle });

  function buildEvent(kind: Kind, p: LiveProduct | null, extra: Record<string, unknown> = {}): OverlayEvent {
    const at = placement(p);
    if (kind === "zoom") return { type: "zoom", payload: at.box ? { box: at.box } : { x: 0.5, y: 0.5 }, ttl: 3000 };
    if (kind === "caption") return { type: "caption", payload: extra, ttl: 2500 };
    if (kind === "poll") {
      const options = pool.length > 1 ? pool.slice(0, 3).map((x) => ({ label: x.name, votes: 0 })) : [{ label: "รับเลย", votes: 0 }, { label: "ขอดูก่อน", votes: 0 }];
      return { type: "poll", payload: { question: pool.length > 1 ? "อยากให้ไลฟ์ตัวไหนต่อ?" : `รับ${p?.name ?? "ตัวนี้"}ไหม?`, options }, ttl: 6000 };
    }
    const data = { ...productData(p), ...extra };
    const moment = KIT_MOMENT[kind];
    const custom = moment && customForMoment(moment, p);
    if (custom) return custom;
    if (kit && moment && motionOn(plan, kit.moments[moment])) return { type: "graphic", preset: kit.moments[moment], data, ...at, image: p ? imageUrl(p) : undefined, theme: kit.theme.look, ttl: READ_MS };
    return { type: kind, payload: kind === "product_card" ? { ...data, ...at, image: p ? imageUrl(p) : undefined } : data, ttl: READ_MS };
  }
  /** spotlight at the tracked box when there is one, else the product card */
  function productEvent(p: LiveProduct): { event: OverlayEvent; label: string } {
    const custom = customForMoment("productIn", p);
    if (custom) return { event: custom, label: "product_card" };
    const at = placement(p);
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
  /** Follow the host to a product (camera saw it, they named it, or they tapped it). Its card plays once, no scene cut. */
  function focusOn(p: LiveProduct | null, why: string) {
    if (!p || p.id === focusRef.current) return;
    focusRef.current = p.id;
    setFocusId(p.id);
    log("ผู้กำกับ", `${t("ตามคนพูด")} → ${p.name} (${t(why)})`);
    if (!liveRef.current || Date.now() - (momentFor.current[p.id] ?? 0) < MOMENT_EVERY) return;
    momentFor.current[p.id] = Date.now();
    lastMoment.current = Date.now();
    const { event, label } = productEvent(p);
    enqueue({ event, key: "product_card", role: "Motion", text: describe(label, p) });
  }

  // ---------- speech ----------
  // useLiveSpeech: OpenAI transcription with the lineup as hints, then a correction pass that also names the product.
  function onHeard(heard: LiveSentence) {
    const text = (heard.corrected || heard.raw).trim();
    if (!text) return;
    finals.current = [...finals.current.filter((f) => Date.now() - f.at < 10000), { text, at: Date.now() }];
    setLines((l) => [...l.slice(-7), text]);
    const said = heard.productId ? pool.find((p) => p.id === heard.productId) ?? null : null;
    if (said) { spoken.current = { id: said.id, at: Date.now() }; focusOn(said, "พูดถึง"); }
    if (heard.source === "openai" && heard.corrected && heard.corrected !== heard.raw) log("ซับ", `${t("แก้คำที่ได้ยิน")}: ${heard.raw} → ${heard.corrected}`);
    const combo = heard.combo;
    const motion = combo ? playCombo(combo, heard, text) : onSentence(text);
    const row: Heard = { id: ++heardId.current, time: new Date().toLocaleTimeString("th-TH", { hour12: false }), raw: heard.raw, corrected: heard.corrected,
      product: (pool.find((p) => p.id === spoken.current?.id) ?? null)?.name ?? null, motion, ms: hearing.lastLatencyMs ?? null };
    setHeard((h) => [row, ...h].slice(0, 40));
    console.info("[live] heard", { raw: row.raw, corrected: row.corrected, product: row.product, motion: row.motion, latencyMs: row.ms, source: heard.source });
    const session = scriptSession.current;
    if (session) void liveApi.sendUtterance(session.id, { text, final: true, tsMs: Date.now() - session.t0 })
      .then((next) => { if (next && scriptSession.current === session) setNextLines((l) => [next, ...l].slice(0, 4)); })
      .catch(() => { /* a missed suggestion is fine; the next sentence tries again */ });
  }
  /** The speech AI's pick for this sentence: one info graphic + one effect + the hook caption, layered. Null picks = nothing fires. */
  function playCombo(raw: Combo, heard: LiveSentence, text: string): string | null {
    const c = { ...raw, caption: raw.caption && shortCaption(raw.caption) };
    const named = pool.find((x) => namesProduct(text, x));
    if (named) { spoken.current = { id: named.id, at: Date.now() }; focusOn(named, "พูดถึง"); }
    const p = named ?? verifiedProduct() ?? spokenProduct() ?? current;
    const layers: OverlayEvent[] = [];
    const names: string[] = [];
    if (c.accent && motionOn(plan, c.accent)) {
      const at = placement(p); // spot effects burst at the product when it is boxed, else upper middle
      layers.push({ type: "graphic", preset: c.accent, data: { ...productData(p), text: c.caption ?? "" }, ...(at.box ? at : { x: 0.5, y: 0.4 }), theme: kit?.theme.look, ttl: READ_MS });
      names.push(c.accent);
    }
    const main = c.main && motionOn(plan, c.main) ? mainEvent(c.main, p, heard, c.caption) : null;
    if (main) { layers.push(main); names.push(c.main!); }
    if (c.caption && !main) { layers.push(buildEvent("caption", null, { text: c.caption })); names.push(`“${c.caption}”`); }
    if (!layers.length) return null;
    const [first, ...rest] = layers;
    return enqueue({ event: first, layers: rest, key: "combo:" + (c.main ?? c.accent ?? "caption"), role: "คนตัดต่อ", text: `${t("ตัดต่อ")} · ${names.join(" + ")}` }, 8000) ? names.join(" + ") : null;
  }
  /** The combo's information graphic; product graphics need a product, stock needs a real number. */
  function mainEvent(id: string, p: LiveProduct | null, heard: LiveSentence, caption: string | null): OverlayEvent | null {
    if (id === "product_card") return p ? productEvent(p).event : null;
    if (id === "price_drop") { const from = heard.from ?? p?.price ?? 0, to = heard.to ?? heard.price ?? 0; if (!(from > to && to > 0)) return null; if (p) discount.current = { id: p.id, from, to }; return buildEvent("price_drop", p, { from, to }); }
    if (id === "price_pop") return p || heard.price ? buildEvent("price_pop", p, heard.price ? { price: heard.price } : {}) : null;
    if (id === "low_stock") return heard.left ? buildEvent("low_stock", p, { left: heard.left }) : null;
    if (id === "free_badge" || id === "poll" || id === "fireworks") return buildEvent(id, p, caption ? { text: caption } : {});
    if (needsProduct(id) && !p) return null;
    const at = BOX_PRESETS.has(id) ? placement(p) : {};
    if (BOX_PRESETS.has(id) && !("box" in at && at.box)) return null;
    return { type: "graphic", preset: id, data: { ...productData(p), text: caption ?? p?.name ?? "", code: p?.id }, ...at, image: p ? imageUrl(p) : undefined, theme: kit?.theme.look, ttl: READ_MS };
  }
  /** One finished sentence: cut to the motion that fits it, only showing a product that is really there or just named. */
  function onSentence(text: string): string | null {
    const named = pool.find((x) => namesProduct(text, x));
    if (named) { spoken.current = { id: named.id, at: Date.now() }; focusOn(named, "พูดถึง"); }
    const p = named ?? verifiedProduct() ?? spokenProduct();
    const all = cuesFromSpeech(text, p);
    if (!all.length) return onKeywords(text, p);
    const at = placement(p);
    const cue = all.filter((c) => (!c.needsProduct || p) && (!BOX_PRESETS.has(c.preset) || (c.needsProduct && at.box))).sort((a, b) => b.priority - a.priority)[0];
    if (!cue) return null;
    const event: OverlayEvent = (cue.preset === "cf-keycaps" && customForMoment("callToAction", p)) || (cue.kind === "graphic"
      ? { type: "graphic", preset: cue.preset, data: { ...productData(cue.needsProduct ? p : null), ...cue.data }, ...(cue.needsProduct ? at : {}), image: cue.needsProduct && p ? imageUrl(p) : undefined, theme: kit?.theme.look, ttl: READ_MS }
      : { type: cue.preset, payload: { ...cue.data, ...(cue.preset === "zoom" && at.box ? { box: at.box } : {}) }, ttl: READ_MS });
    return enqueue({ event, key: "cue:" + cue.preset, role: "คนตัดต่อ", text: `${t("ตัดต่อ")} · ${cue.reason} → ${cue.preset}` }, 10000) ? `${cue.preset} · ${cue.reason}` : null;
  }
  // fallback when cuesFromSpeech has nothing; p is only a verified or just-named product, never the run-of-show's guess
  function onKeywords(text: string, p: LiveProduct | null): string | null {
    for (const hit of keywordHits(text)) {
      let event: OverlayEvent;
      let label: string = hit.kind;
      if (hit.kind === "price_drop") {
        const [a, b] = hit.nums.length > 1 ? [Math.max(...hit.nums), Math.min(...hit.nums)] : [p?.price ?? 0, hit.nums[0] ?? 0];
        if (a > b && b > 0) { event = buildEvent("price_drop", p, { from: a, to: b }); if (p) discount.current = { id: p.id, from: a, to: b }; }
        else { event = buildEvent("price_pop", p, { name: "ลดพิเศษ" + (p ? " · " + p.name : "") }); label = "price_pop"; }
      } else if (hit.kind === "price_pop") event = buildEvent("price_pop", p, { price: hit.nums[0] });
      else if (hit.kind === "free_badge") event = buildEvent("free_badge", p, { text: hit.text, sub: p?.name });
      else if (hit.kind === "low_stock") {
        const left = hit.nums[0] ?? (/ชิ้นสุดท้าย|last one/i.test(text) ? 1 : 0);
        if (!left) continue; // never invent a stock count
        event = buildEvent("low_stock", p, { left });
      }
      else { if (!placement(p).box) continue; event = buildEvent("zoom", p); }
      if (enqueue({ event, key: label, role: roleFor(label), text: describe(label, p) + ` · "${text.slice(0, 32)}"` }, 10000)) return describe(label, p);
    }
    return null;
  }

  // ---------- Decisions AI (arrives through useLiveDetection) ----------
  function onDecision(d: Decision) {
    if (!liveRef.current) return;
    const dp = pool.find((x) => x.id === d.product || x.name === d.product) ?? null;
    const vp = verifiedProduct();
    const fp = vp ?? spokenProduct(); // what graphics may name right now
    if (d.product && d.product !== lastAiProduct.current && (d.productConfidence ?? 0) > 0.6) {
      lastAiProduct.current = d.product;
      log("ผู้กำกับ", t("AI เห็นสินค้า") + ` · ${dp?.name ?? d.product} (${pct(d.productConfidence)})`);
    }
    if ((d.riskyClaim ?? 0) > 0.7) {
      setWarning({ text: lines.at(-1) ?? "", at: Date.now() });
      log("โปรดิวเซอร์", t("เตือน: คำพูดเกินจริง") + ` (${pct(d.riskyClaim)})`, "warn");
    }
    const w = win.current;
    w.n++;
    if (d.energy === "low") w.low++;
    if ((d.heldUp ?? 0) > w.heldMax && dp) { w.heldMax = d.heldUp ?? 0; w.heldId = dp.id; }
    lowEnergy.current = d.energy === "low" ? lowEnergy.current + 1 : 0;
    if (lowEnergy.current === 2) { setSuggestPoll(true); log("ผู้กำกับ", t("คนดูเริ่มเงียบ แนะนำเปิดโหวต"), "warn"); }

    if (d.teamCommand && d.teamCommand !== "none") { // an explicit order from the team, so it may use the run-of-show product
      const p = fp ?? current;
      log("ผู้กำกับ", t("ทีมสั่งด้วยเสียง") + " · " + t(LABEL[d.teamCommand as Kind] ?? (d.teamCommand === "dead_air_clip" ? "เปิดคลิปกันเงียบ" : "ช่วงถัดไป")), "action");
      if (d.teamCommand === "dead_air_clip") playClip();
      else if (d.teamCommand === "next_segment") focusOn(pool[(pool.findIndex((x) => x.id === current?.id) + 1) % pool.length] ?? null, "ทีมสั่ง");
      else if (d.teamCommand === "product_card") showProductNow(p);
      else now(d.teamCommand, p);
      return;
    }
    // the product moment: the verified product, held up to the camera
    if (vp && dp?.id === vp.id && (d.heldUp ?? 0) >= 0.6) {
      if (Date.now() - lastMoment.current > 8000) {
        lastMoment.current = Date.now();
        const { event, label } = productEvent(vp);
        enqueue({ event, key: "product_card", role: "ผู้กำกับ", text: `${t("เห็น")} ${vp.name} ${t("ถือขึ้นกล้อง")} (${t("มั่นใจ")} ${pct(d.productConfidence ?? detection.confidence)}) → ${label.replace("_", "-")}` });
        return;
      }
    }
    // a motion must answer what the host just said; a still picture alone never fires one
    const fresh = Date.now() - (finals.current.at(-1)?.at ?? 0) < FRESH_SPEECH;
    if (!fresh) return;
    if (d.motion && d.motion !== "none" && (d.motionConfidence ?? 0) >= 0.7) {
      const cm = d.motion.startsWith("custom:") ? kit?.custom?.find((x) => "custom:" + x.id === d.motion) : undefined;
      if (d.motion.startsWith("custom:") && !cm) return;
      const mp = needsProduct(d.motion) ? (BOX_PRESETS.has(d.motion) ? vp : fp) : null;
      if (needsProduct(d.motion) && !mp) return;
      if (cm) { enqueue({ event: customEventFor(cm, mp), key: d.motion, role: "Motion", text: "" }, 15000); return; }
      const at = placement(mp);
      if (BOX_PRESETS.has(d.motion) && !at.box) return;
      const text = (lines.at(-1) ?? mp?.name ?? "").slice(0, 40);
      enqueue({
        event: { type: "graphic", preset: d.motion, data: { ...productData(mp), text }, ...at, image: mp ? imageUrl(mp) : undefined, theme: kit?.theme.look, ttl: READ_MS },
        key: d.motion, role: "Motion", text: t("เลือก") + ` ${d.motion} (${t("มั่นใจ")} ${pct(d.motionConfidence)})` + (mp ? " · " + mp.name : ""),
      }, 15000);
      return;
    }
    if (d.action === "none" || d.action === "product_card" || (d.actionConfidence ?? 0) < 0.7) return; // product_card is the moment above
    const kind = d.action as Kind;
    if (kind === "low_stock") return; // no real stock data to show
    if (kind === "zoom" ? !vp || !placement(vp).box : ["price_pop", "price_drop"].includes(kind) && !fp) return;
    const p = kind === "zoom" ? vp : fp;
    enqueue({ event: buildEvent(kind, p), key: kind, role: roleFor(kind), text: describe(kind, p) }, 15000);
  }

  // ---------- AI director: one decision per 8–12 s window, built from the Decisions gathered in it ----------
  /** Hard cut between Wide and Close, like an edited video. Local preview punches the video in; OBS gets zoom / zoom_out. */
  function jumpZoom() {
    lastChange.current = Date.now();
    zoomClose.current = !zoomClose.current;
    const f = face.box;
    if (!zoomClose.current) { setPunch(null); if (mode === "obs") send({ type: "zoom_out" }); return; }
    if (mode === "local") { const c = f ? toView(f) : { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }; setPunch({ scale: 1.3, x: c.x + c.w / 2, y: c.y + c.h / 2 }); return; }
    const big = f && { x: Math.max(0, f.x - f.w), y: Math.max(0, f.y - f.h * 0.5), w: Math.min(1, f.w * 3), h: Math.min(1, f.h * 2.5) };
    send({ type: "zoom", payload: big ? { box: big } : { x: 0.5, y: 0.5 }, ttl: 9000 });
  }
  function directWindow() {
    const w = win.current;
    const now = Date.now();
    const secs = Math.round((now - w.start) / 1000);
    const vp = verifiedProduct();
    const quiet = now - (finals.current.at(-1)?.at ?? liveStart.current) >= 10000;
    const idle = now - lastChange.current;
    if (lastChange.current >= w.start) { /* something already changed on screen this window: leave it alone */ }
    else if (vp && w.heldId === vp.id && w.heldMax >= 0.6) {
      lastMoment.current = now;
      const { event, label } = productEvent(vp);
      if (enqueue({ event, key: "product_card", role: "ผู้กำกับ", text: `${t("ช่วง")} ${secs} ${t("วิ")}: ${t("ยกสินค้า")} ${vp.name} → ${label.replace("_", "-")}` })) log("ผู้กำกับ", `${t("ช่วง")} ${secs} ${t("วิ")}: ${t("ยกสินค้า")} ${vp.name} → ${t("การ์ดสินค้า")}`);
    } else if ((w.low >= 2 || quiet) && !suggestPoll) { setSuggestPoll(true); log("ผู้กำกับ", `${t("ช่วง")} ${secs} ${t("วิ")}: ${t("คนดูเงียบ → แนะนำโหวต")}`, "warn"); }
    else if (!queue.current.length && now - lastBig.current >= BIG_GAP) { log("ผู้กำกับ", `${t("จอนิ่ง")} ${Math.round(idle / 1000)} ${t("วิ")} → jump zoom (${zoomClose.current ? "Wide" : "Close"})`, "action"); jumpZoom(); }
    win.current = { start: now, length: WINDOW_MS[0] + Math.random() * (WINDOW_MS[1] - WINDOW_MS[0]), heldMax: 0, heldId: null, low: 0, n: 0 };
  }
  /** face box to the overlay (keeps graphics off the host's face), ~4×/s and only when it moved */
  function sendFace() {
    const f = face.box ? (mode === "local" ? toView(face.box) : face.box) : null;
    const last = faceSent.current;
    if (Date.now() - last.at < 220 || (!f && !last.box) || (f && last.box && Math.abs(f.x - last.box.x) + Math.abs(f.y - last.box.y) + Math.abs(f.w - last.box.w) < 0.04)) return;
    faceSent.current = { box: f, at: Date.now() };
    send({ type: "face_box", payload: f });
  }

  // ---------- clock ----------
  function tick() {
    pump();
    setClock(Math.floor(Date.now() / 1000));
    if (warning && Date.now() - warning.at > 8000) setWarning(null);
    if (!liveRef.current) { setAi((a) => (a.status === "idle" ? a : { status: "idle", id: null })); return; }
    sendFace();
    if (Date.now() - win.current.start >= win.current.length) directWindow();
    const vp = verifiedProduct();
    if (detection.product) noneSince.current = Date.now();
    const status: AiStatus = !detection.running ? "watching" : vp ? "verified" : detection.product ? "confirming" : Date.now() - noneSince.current >= 3000 ? "none" : "watching";
    const seen = vp?.id ?? detection.product;
    setAi((a) => (a.status === status && a.id === seen ? a : { status, id: seen }));
    // follow the camera: the verified product becomes the current one (its card plays once per MOMENT_EVERY)
    // a confirmed product (≥90% from the Decisions AI) is followed at once; graphics that point at it still wait for the box
    const seenNow = vp ?? ((detection.confidence ?? 0) >= 0.9 ? pool.find((p) => p.id === detection.product) ?? null : null);
    if (seenNow) focusOn(seenNow, "กล้องเห็น");
    if (detection.product !== lastConfirmed.current) {
      lastConfirmed.current = detection.product;
      if (detection.product) log("ผู้กำกับ", t("กล้องจับสินค้าได้") + ` · ${detectedName} ${pct(detection.confidence)}`);
    }
    if (detection.error !== lastDetectError.current) {
      lastDetectError.current = detection.error;
      if (detection.error) log("ผู้กำกับ", t("Decisions AI ผิดพลาด ไลฟ์ยังเดินต่อ") + ": " + detection.error, "error");
    }
  }

  useEffect(() => { latest.current = { tick, sentence: onHeard, decision: onDecision, log }; });

  // lineup products with no playbook yet get one in the background (the seller may have skipped step 3)
  const building = useRef(new Set<string>());
  useEffect(() => {
    for (const p of lineup) {
      if (plan.shows?.[p.id] || building.current.has(p.id)) continue;
      building.current.add(p.id);
      void buildShow(p, plan.style).then((show) => setPlan((x) => ({ ...x, shows: { ...x.shows, [p.id]: show.id } }))).catch(() => building.current.delete(p.id));
    }
  }, [lineup, plan.shows, plan.style, setPlan]);

  // One live-script session per current product's show while live; our own transcribed sentences feed it (onHeard).
  const showId = current ? plan.shows?.[current.id] : undefined;
  useEffect(() => {
    if (!live || !showId) return;
    let cancelled = false;
    let started: { id: string; t0: number } | null = null;
    const t0 = Date.now();
    void liveApi.startSession(showId, { showOnStream: false }).then((s) => {
      if (cancelled) { void liveApi.stopSession(s.sessionId).catch(() => undefined); return; }
      started = { id: s.sessionId, t0 };
      scriptSession.current = started;
      setNextHint("");
    }).catch(() => { if (!cancelled) setNextHint("เปิดบทพูดไม่ได้ บทของสินค้านี้อาจยังไม่เสร็จ"); });
    return () => {
      cancelled = true;
      if (started) { void liveApi.stopSession(started.id).catch(() => undefined); if (scriptSession.current === started) scriptSession.current = null; }
      setNextLines([]);
      setNextHint("");
    };
  }, [live, showId]);

  // ---------- go live / end ----------
  function goLive() {
    const sec = Math.floor(Date.now() / 1000);
    liveRef.current = true;
    setLive(true);
    setStartSec(sec);
    setClock(sec);
    setHeard([]);
    queue.current = [];
    lowEnergy.current = 0;
    finals.current = [];
    lastConfirmed.current = null;
    lastDetectError.current = null;
    verif.current = null;
    spoken.current = null;
    lastMoment.current = 0;
    momentFor.current = {};
    noneSince.current = Date.now();
    liveStart.current = Date.now();
    win.current = { start: Date.now(), length: 10000, heldMax: 0, heldId: null, low: 0, n: 0 };
    zoomClose.current = false;
    faceSent.current = { box: null, at: 0 };
    setPunch(null);
    setSuggestPoll(false);
    if (cameraError) setCameraTry((n) => n + 1);
    // the sting and the theme go out now; nothing waits for detection, AI or the mic
    send({ type: "theme", payload: { accent: kit?.theme.accent ?? plan.style.accent, accent2: kit?.theme.accent2 ?? plan.style.accent2, font: plan.style.font || undefined } });
    log("ผู้กำกับ", t(mode === "local" ? "เริ่มไลฟ์ พรีวิวบนจอนี้" : "ออนแอร์ ทุกคนประจำที่"), "action");
    const shop = plan.style.shop || "SnapPromo";
    lastBig.current = 0;
    play({
      event: customForMoment("intro", null) ?? { type: "graphic", preset: pickOn(kit?.moments.intro, "blinds-sting"), data: { text: kit?.sting.headline || shop, sub: kit?.sting.kicker, kicker: "LIVE", title: kit?.sting.headline || shop, name: shop }, theme: kit?.theme.look, ttl: 1600 },
      key: "intro", role: "Motion", text: t("เปิดไลฟ์") + " · " + (kit?.sting.headline || shop),
    });
  }
  function endLive() {
    liveRef.current = false;
    setLive(false); // also stops detection and speech (enabled: live)
    queue.current = [];
    const outro = customForMoment("outro", null);
    if (outro) play({ event: outro, key: "outro", role: "Motion", text: "" });
    send({ type: "zoom_out" });
    send({ type: "face_box", payload: null });
    setPunch(null);
    zoomClose.current = false;
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
  const aiProduct = products.find((p) => p.id === ai.id) ?? null;
  const chipText = { idle: "รอเริ่มไลฟ์", watching: "กำลังดู…", confirming: "กำลังยืนยัน", verified: "ยืนยันแล้ว ✓", none: "ไม่พบสินค้าในภาพ" }[ai.status];
  const rows: { icon: typeof Radio; label: string; short: string; status: Status; detail: string }[] = [
    { icon: Camera, label: t("กล้อง"), short: t("กล้อง"), status: cameraError ? "err" : activeCamera ? "ok" : "warn", detail: cameraError ? t(cameraError) : activeCamera?.label || t("กำลังเปิดกล้อง…") },
    {
      icon: BrainCircuit, label: t("AI ตรวจจับสินค้า"), short: "AI",
      status: !live ? "off" : detection.error ? "err" : detection.running ? "ok" : "warn",
      detail: !live ? t("พร้อม รอเริ่มไลฟ์") : detection.error ? detection.error : detection.running
        ? [t("กำลังตรวจ"), detection.latencyMs != null && `${detection.latencyMs} ms`, detectedName && `${detectedName} ${pct(detection.confidence)}`].filter(Boolean).join(" · ")
        : t("กำลังเริ่ม…"),
    },
    {
      icon: Mic, label: t("ไมค์ถอดเสียง"), short: t("ไมค์"),
      status: speech === "on" ? "ok" : speech === "off" ? "off" : "err",
      detail: t(speech === "on" ? "กำลังฟัง" : speech === "unsupported" ? "ใช้ได้เฉพาะ Google Chrome" : speech === "error" ? "เปิดไมค์ไม่ได้" : "พร้อม รอเริ่มไลฟ์"),
    },
    {
      icon: Crosshair, label: t("กล้องจับหน้า"), short: t("จับหน้า"),
      status: (!live ? "off" : face.error ? "err" : !face.ready ? "warn" : "ok") as Status,
      detail: !live ? t("พร้อม รอเริ่มไลฟ์") : face.error ? t("โหลดไม่ได้") : !face.ready ? t("กำลังเริ่ม…") : face.box ? t("พร้อม") : t("ไม่พบหน้า"),
    },
    ...(mode === "obs" ? [{
      icon: MonitorPlay, label: "OBS Browser Source", short: "OBS",
      status: (obsConnected == null ? "err" : obsConnected > 0 ? "ok" : "warn") as Status,
      detail: obsConnected == null ? t("เช็กสถานะไม่ได้") : obsConnected > 0 ? t("เชื่อมต่อแล้ว") + ` ${obsConnected} ${t("จอ")}` : t("รอ Browser Source เชื่อมต่อ"),
    }] : []),
  ];
  const statusWord: Record<Status, string> = { ok: t("พร้อม"), warn: t("รอ"), err: t("มีปัญหา"), off: t("ยังไม่เริ่ม") };
  const spotProduct = pool.find((p) => p.id === (spotId || current?.id)) ?? null;

  return <section className="cr" data-mode={mode} data-live={live || undefined} aria-label={t("ห้องควบคุมไลฟ์")}>
    <header className="cr-bar">
      <div className="cr-tally" role="status" aria-live="polite">
        <span className="cr-tally-light">{live ? "ON AIR" : "STANDBY"}</span>
        <span className="cr-timecode">{timecode(elapsed)}</span>
      </div>
      <div className="cr-modes" role="group" aria-label={t("โหมดไลฟ์")}>
        <button type="button" aria-pressed={mode === "local"} disabled={live} onClick={() => chooseMode("local")}><Smartphone size={15} aria-hidden />{t("พรีวิวบนจอนี้")}</button>
        <button type="button" aria-pressed={mode === "obs"} disabled={live} onClick={() => chooseMode("obs")}><MonitorPlay size={15} aria-hidden />{t("ส่งเข้า OBS")}</button>
      </div>
      <button ref={detailsButton} type="button" className="cr-btn cr-details-btn" aria-expanded={detailsOpen} aria-controls="cr-details" onClick={() => setDetailsOpen((o) => !o)}>
        <SlidersHorizontal size={15} aria-hidden />{t("รายละเอียดระบบ")}
      </button>
    </header>

    {!products.length && <p className="cr-hint">{t("ยังไม่มีสินค้าในคลัง เพิ่มได้ที่ขั้นตอน 1 คลังสินค้า (แถบขั้นตอนด้านบน)")}</p>}
    {products.length > 0 && !lineup.length && <p className="cr-hint">{t("ยังไม่ได้เลือกสินค้าเข้าไลฟ์ เลือกได้ที่ขั้นตอน 2 สไตล์และสินค้าในไลฟ์")}</p>}

    <div className="cr-layout">
      <div className="cr-stage">
        <div className="cr-screen">
          <video ref={videoRef} autoPlay muted playsInline style={punch && mode === "local" ? { transform: `scale(${punch.scale}) scaleX(-1)`, transformOrigin: `${punch.x * 100}% ${punch.y * 100}%` } : undefined} onLoadedMetadata={(e) => setVideoAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9)} />
          {mode === "obs" && <>
            <span className="cr-chip cr-chip-pgm">PGM</span>
            {live && <span className="cr-chip cr-chip-live">LIVE {timecode(elapsed)}</span>}
          </>}
          <iframe ref={previewRef} src={PREVIEW_SRC} title={t("ภาพ overlay แบบเดียวกับใน OBS")} tabIndex={-1} aria-hidden />
          {cameraError && <p className="cr-screen-msg"><Camera size={20} aria-hidden />{t(cameraError)}</p>}
        </div>

        <div className="cr-go-row">
          {live
            ? <button type="button" className="cr-go cr-end" onClick={endLive}><Square size={16} fill="currentColor" aria-hidden />{t("จบไลฟ์")}</button>
            : <button type="button" className="cr-go" onClick={goLive}><Radio size={20} aria-hidden />{t("เริ่มไลฟ์")}</button>}
          <button type="button" className="cr-health" onClick={() => setDetailsOpen(true)} aria-label={t("สถานะระบบ") + ": " + rows.map((r) => `${r.short} ${statusWord[r.status]}`).join(", ") + ". " + t("เปิดรายละเอียดระบบ")}>
            {rows.map((r) => <span key={r.short} data-status={r.status}>
              {r.short}{r.status === "ok" ? <Check size={13} aria-hidden /> : r.status === "off" ? <span className="cr-health-dot" aria-hidden /> : <CircleAlert size={13} aria-hidden />}
            </span>)}
          </button>
        </div>
        <p className="cr-stage-note">{mode === "obs" ? t("จอนี้แสดงภาพเดียวกับที่ OBS ออกอากาศ") : t("พรีวิวกล้องจริงบนจอนี้ ไม่ส่งไป OBS")}</p>
      </div>

      <div className="cr-host">
        <section className="cr-panel cr-next" aria-label={t("พูดต่อไป")}>
          <h2>{t("AI โค้ชไลฟ์ · พูดต่อไป")}</h2>
          {live && nextLines.length ? <>
              <div className="cr-next-now" data-hesitation={nextLines[0].hesitation || undefined} aria-live="polite">
                <div className="cr-next-meta">
                  <span className="cr-next-stage">{t(STAGE_LABEL[nextLines[0].stage] ?? nextLines[0].stage)}</span>
                  {nextLines[0].topic && <span className="cr-quiet">{nextLines[0].topic}</span>}
                  {nextLines[0].hesitation && <span className="cr-next-stall">{t("ติดอยู่ ลองพูดบรรทัดนี้")}</span>}
                </div>
                {nextLines[0].warning && <p className="cr-next-warn" data-level={nextLines[0].warning.level}><TriangleAlert size={16} aria-hidden />{nextLines[0].warning.text}</p>}
                <ul>{nextLines[0].next.slice(0, 3).map((line, i) => <li key={i}>{line}</li>)}</ul>
              </div>
              {nextLines.slice(1, 4).map((x) => <p key={x.id} className="cr-next-old">{x.next[0]}</p>)}
            </>
            // nothing from the coach yet: the current product's own lines, so the seller is never left without words
            : segment ? <div className="cr-next-now" aria-live="polite">
                <div className="cr-next-meta"><span className="cr-next-stage">{t("ลองพูด")}</span><span className="cr-quiet">{segment.title}</span></div>
                <ul>{[segment.opening, ...segment.talkingPoints.slice(0, 1), segment.callToAction].filter(Boolean).slice(0, 3).map((line, i) => <li key={i}>{line}</li>)}</ul>
              </div>
            : <p className="cr-quiet cr-small">{t("เลือกสินค้าเข้าไลฟ์ที่ขั้นตอน 2 แล้ว AI จะช่วยคิดบทให้")}</p>}
          <p className="cr-quiet cr-small" role="status">{!live ? t("กดเริ่มไลฟ์ แล้วพูดได้เลย AI ฟัง ดูกล้อง ขึ้น motion และแนะนำประโยคถัดไปให้เอง")
            : nextHint ? t(nextHint) : !showId ? t("AI กำลังเตรียมบทของสินค้านี้…") : !nextLines.length ? t("กำลังฟังอยู่ พูดต่อได้เลย") : ""}</p>
          {showId && <div className="vs cr-next-reply"><ReplyBox showId={showId} /></div>}
        </section>

        <section className="cr-panel cr-ai" data-state={ai.status} aria-label={t("AI กำลังเห็น")}>
          <div className="cr-ai-head">
            <h2><Eye size={15} aria-hidden />{t("AI กำลังเห็น")}</h2>
            <span className="cr-ai-chip" role="status">{t(chipText)}</span>
          </div>
          <div className="cr-ai-body">
            {aiProduct?.images[0]
              // eslint-disable-next-line @next/next/no-img-element -- detection-service image through a rewrite
              ? <img src={productImage(aiProduct.images[0])} alt={aiProduct.name} />
              : <span className="cr-ai-ph" aria-hidden><Eye size={20} /></span>}
            <div>
              <strong>{aiProduct?.name ?? t("ยังไม่เห็นสินค้า")}</strong>
              {aiProduct && <span>{baht(aiProduct.price)}</span>}
              {aiProduct && detection.confidence != null && <>
                <progress className="cr-ai-bar" max={100} value={Math.round(detection.confidence * 100)} aria-label={t("ความมั่นใจ")} />
                <small>{t("มั่นใจ")} {pct(detection.confidence)}</small>
              </>}
            </div>
          </div>
          <p className="cr-ai-reason">{reason || t("เหตุผลของผู้กำกับจะขึ้นที่นี่")}</p>
        </section>
        {warning && <div className="cr-warning" role="alert"><TriangleAlert size={18} aria-hidden />
          <div><strong>{t("ระวังคำพูดเกินจริง (เห็นเฉพาะจอนี้ ไม่ขึ้นไลฟ์)")}</strong>{warning.text && <span>“{warning.text}”</span>}</div>
          <button type="button" className="cr-btn" onClick={() => setWarning(null)}>{t("รับทราบ")}</button>
        </div>}
        {suggestPoll && <div className="cr-suggest" role="status"><span>{t("ผู้กำกับ: คนดูเริ่มเงียบ แนะนำเปิดโหวต")}</span>
          <button type="button" className="cr-btn cr-btn-accent" onClick={() => { now("poll", current); setSuggestPoll(false); }}><Vote size={15} aria-hidden />{t("เปิดโหวต")}</button>
          <button type="button" className="cr-btn" onClick={() => setSuggestPoll(false)}>{t("ปิด")}</button>
        </div>}


        <section className="cr-panel cr-prompter" aria-label={t("สินค้าที่กำลังพูด")}>
          {!segment ? <p className="cr-quiet">{t("ยังไม่มีสินค้าในไลฟ์ เลือกได้ที่ขั้นตอน 2")}</p> : <>
            <div className="cr-prompter-head">
              <div className="cr-seg">
                <span className="cr-seg-count">{t("กำลังพูดถึง · AI ตามกล้องและเสียงให้เอง")}</span>
                <h2 className="cr-seg-title">{segment.title}</h2>
              </div>
            </div>
            {current && <p className="cr-cta">{baht(current.price)} · CF {current.id}</p>}
            {pool.length > 1 && <div className="cr-focus" role="group" aria-label={t("เปลี่ยนสินค้าเอง")}>
              {pool.map((p) => <button key={p.id} type="button" className="cr-btn" aria-pressed={p.id === current?.id} onClick={() => focusOn(p, "กดเลือก")}>{p.name}</button>)}
            </div>}
          </>}
        </section>

        <section className="cr-panel cr-heard" aria-label={t("ได้ยินอะไร")}>
          <h2><Mic size={15} aria-hidden />{t("ได้ยินอะไร")}<span className="cr-quiet cr-small"> · {t(speech === "on" ? "กำลังฟัง" : speech === "unsupported" ? "ใช้ได้เฉพาะ Google Chrome" : speech === "error" ? "เปิดไมค์ไม่ได้" : "เริ่มไลฟ์แล้วจะฟัง")}{hearing.level > 0.02 ? " ●" : ""}</span></h2>
          {interim && <p className="cr-heard-interim" aria-live="polite">{interim}…</p>}
          {!heard.length && !interim ? <p className="cr-quiet cr-small">{t("ทุกประโยคที่ระบบถอดได้จะขึ้นที่นี่ พร้อมสินค้าและ motion ที่มันเลือก")}</p>
            : <ol className="cr-heard-list">
              {heard.map((h) => <li key={h.id}>
                <span className="cr-heard-time">{h.time}{h.ms != null && ` · ${h.ms} ms`}</span>
                <p>{h.corrected || h.raw}</p>
                {h.corrected && h.corrected !== h.raw && <p className="cr-heard-raw">{t("ได้ยินดิบ")}: {h.raw}</p>}
                <span className="cr-heard-tags">
                  {h.product && <span>{h.product}</span>}
                  <span data-none={!h.motion || undefined}>{h.motion ? "→ " + h.motion : t("ไม่ขึ้น motion")}</span>
                </span>
              </li>)}
            </ol>}
        </section>

        <section className="cr-panel" aria-label={t("ปุ่มลัดของโฮสต์")}>
          <div className="cr-tiles">
            <button type="button" className="cr-tile" disabled={!current} onClick={() => now("price_pop", current)}><Tag aria-hidden /><span>{t("เด้งราคา")}</span>{current && <small>{baht(current.price)}</small>}</button>
            <button type="button" className="cr-tile" disabled={!spotProduct} onClick={() => showProductNow(spotProduct)}><Crosshair aria-hidden /><span>{t("โชว์สินค้า")}</span></button>
            <button type="button" className="cr-tile" data-suggested={suggestPoll || undefined} onClick={() => now("poll", current)}><Vote aria-hidden /><span>{t("โหวต")}</span></button>
            <button type="button" className="cr-tile" onClick={() => now("fireworks", current)}><PartyPopper aria-hidden /><span>{t("พลุ")}</span></button>
            <button type="button" className="cr-tile" onClick={() => now("zoom", current)}><ZoomIn aria-hidden /><span>{t("ซูม")}</span></button>
            <button type="button" className="cr-tile" onClick={playClip}><Film aria-hidden /><span>{t("คลิปกันเงียบ")}</span></button>
            <button type="button" className="cr-tile" onClick={() => { send({ type: "zoom_out" }); log("คนตัดต่อ", t("ล้างจอ"), "action"); }}><Eraser aria-hidden /><span>{t("ล้างจอ")}</span></button>
          </div>
          {pool.length > 1 && <label className="cr-spot">
            <span>{t("สินค้าที่จะโชว์")}</span>
            <select value={spotId || current?.id || ""} onChange={(e) => setSpotId(e.target.value)}>
              {pool.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>}
        </section>
      </div>
    </div>

    <aside id="cr-details" className="cr-sheet" hidden={!detailsOpen} aria-labelledby="cr-details-title">
      <header className="cr-sheet-head">
        <h2 id="cr-details-title">{t("รายละเอียดระบบ")}</h2>
        <button ref={detailsClose} type="button" className="cr-icon-btn" onClick={closeDetails} aria-label={t("ปิด")}><X size={18} aria-hidden /></button>
      </header>

      <section className="cr-sheet-sec" aria-labelledby="cr-sec-status">
        <h3 id="cr-sec-status">{t("เชื่อมต่อ")}</h3>
        <ul className="cr-rows">
          {rows.map((r) => <li key={r.label} data-status={r.status}>
            <span className="cr-dot" aria-hidden /><r.icon size={16} aria-hidden />
            <span className="cr-row-label">{r.label}</span>
            <span className="cr-row-detail">{r.detail}</span>
            <span className="cr-sr">{statusWord[r.status]}</span>
          </li>)}
        </ul>
        <label className="cr-field"><span>{t("เลือกกล้องของจอมอนิเตอร์")}</span>
          <select value={deviceId || activeCamera?.id || ""} onChange={(e) => setDeviceId(e.target.value)}>
            {!cameras.length && <option value="">{t("กล้องเริ่มต้น")}</option>}
            {cameras.map((c, i) => <option key={c.deviceId || i} value={c.deviceId}>{c.label || `${t("กล้อง")} ${i + 1}`}</option>)}
          </select>
        </label>
        {mode === "obs" && <div className="cr-obs-link">
          <button type="button" className="cr-btn" disabled={obsBusy} onClick={() => void makeObsLink()}><Link2 size={15} aria-hidden />{t("สร้างลิงก์ OBS ใหม่ (แทนลิงก์เดิม)")}</button>
          {obsUrl && <div className="cr-url">
            <input aria-label="OBS Browser Source URL" readOnly value={obsUrl} onFocus={(e) => e.target.select()} />
            <button type="button" className="cr-btn" onClick={() => void navigator.clipboard.writeText(obsUrl).then(() => setCopied(true))}><Copy size={15} aria-hidden />{t(copied ? "คัดลอกแล้ว" : "คัดลอก")}</button>
          </div>}
          {obsUrl && <p className="cr-quiet">{t("วางใน OBS → Browser Source ขนาด 1920 × 1080")}</p>}
        </div>}
      </section>


      <section className="cr-sheet-sec" aria-labelledby="cr-sec-clips">
        <h3 id="cr-sec-clips">{t("คลิปกันเงียบ")}</h3>
        <div className="cr-clips">
          {plan.clips.length ? plan.clips.map((clip) => <button key={clip.fileId} type="button" className="cr-btn" onClick={() => {
            send({ type: "clip", fileId: clip.fileId });
            log("คนตัดต่อ", t("เปิดคลิปกันเงียบ") + " · " + clip.name, "action");
          }}><Film size={15} aria-hidden />{clip.name}</button>) : <p className="cr-quiet">{t("ยังไม่มีคลิปกันเงียบ เตรียมได้ที่ขั้นตอน 3")}</p>}
        </div>
      </section>


      <section className="cr-sheet-sec" aria-labelledby="cr-sec-crew">
        <h3 id="cr-sec-crew">{t("ทีมงาน AI")}</h3>
        <ol className="cr-feed">
          {!feed.length && <li className="cr-quiet">{t("การตัดสินใจของทีม AI จะขึ้นที่นี่")}</li>}
          {feed.map((f) => <li key={f.id} data-tone={f.tone}>
            <span className="cr-role" data-role={f.role}>{t(f.role)}</span>
            <span>{f.text}{f.count > 1 && <span className="cr-quiet"> ×{f.count}</span>}</span>
            <time>{f.time}</time>
          </li>)}
        </ol>
      </section>
    </aside>
  </section>;
}
