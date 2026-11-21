"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrainCircuit, Camera, Check, ChevronLeft, ChevronRight, CircleAlert, Copy, Crosshair, Eraser, Eye, Film, Link2, Mic,
  MonitorPlay, PartyPopper, Radio, SlidersHorizontal, Smartphone, Square, Tag, TriangleAlert, Vote, X, ZoomIn,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { playOverlay, studioPost, studioRequest } from "@/components/studio/studio-api";
import { useLiveDetection } from "@/lib/live-detect";
import { type LiveSentence, useLiveSpeech } from "@/lib/live-speech";
import { type CustomMotion, type Decision, type LiveProduct, type Segment, productImage, fillMotion } from "@/lib/live-plan";
import { cuesFromSpeech, namesProduct } from "@/lib/live-cues";
import type { StepProps } from "./live-studio";
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
type Queued = { event: OverlayEvent; key: string; role: Role; text: string };


const PREVIEW_SRC = "/overlay/index.html?preview=1#" + "a".repeat(43); // index.html: "/overlay/" gets a trailing-slash redirect from Next
const MODE_KEY = "snappromo-live-mode";
const NEEDS_PRODUCT = /\{(name|price|code)\}/;
const BIG_GAP = 3500; // at most one big motion per 3.5 s
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
const mmss = (s: number) => `${s < 0 ? "-" : ""}${pad(Math.abs(s) / 60)}:${pad(Math.abs(s) % 60)}`;
const baht = (n: number) => "฿" + n.toLocaleString("th-TH");
const pct = (n: number | null | undefined) => (n == null ? "" : Math.round(n * 100) + "%");
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function ControlRoom({ plan, products, overlayOrigin }: StepProps & { overlayOrigin: string }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<Mode>("local");
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const detailsButton = useRef<HTMLButtonElement>(null);
  const detailsClose = useRef<HTMLButtonElement>(null);
  const liveRef = useRef(false);
  const finals = useRef<{ text: string; at: number }[]>([]);
  const queue = useRef<Queued[]>([]);
  const lastBig = useRef(0);
  const lastByKey = useRef(new Map<string, number>());
  const firedCues = useRef(new Set<string>());
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
  const latest = useRef<{ tick: () => void; sentence: (s: LiveSentence) => void; decision: (d: Decision) => void; log: (role: Role, text: string, tone?: Tone) => void } | null>(null);

  // ---------- derived ----------
  const lineup = useMemo(() => plan.lineup.flatMap((item) => products.filter((p) => p.id === item.productId)), [plan.lineup, products]);
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
  const motions = useMemo(() => [
    ...(kit ? Object.entries(kit.moments).filter(([moment]) => moment !== "celebrate").map(([moment, id]) => ({ id, description: MOMENT_NOTES[moment] ?? moment })) : []),
    ...(kit?.custom ?? []).map((m) => ({ id: "custom:" + m.id, description: `${MOMENT_NOTES[m.moment] ?? m.moment}: ${m.description}` })),
    ...GENERAL_MOTIONS.map(([id, description]) => ({ id, description })),
  ].slice(0, 60).filter((m, i, all) => m.id && all.findIndex((x) => x.id === m.id) === i), [kit]);

  // ---------- built-in detection: frames from videoRef, decisions + tracked box back ----------
  const transcript = useCallback(() => finals.current.filter((f) => Date.now() - f.at < 10000).map((f) => f.text).join(" "), []);
  const handleDecision = useCallback((d: Decision) => latest.current?.decision(d), []);
  const detection = useLiveDetection({ video: videoRef, enabled: live, products: pool, transcript, current: current?.name ?? null, motions, onDecision: handleDecision });
  const hearing = useLiveSpeech({
    enabled: live, lang: plan.style.language === "en" ? "en" : "th",
    products: pool.map((p) => ({ id: p.id, name: p.name, price: p.price })), current: current?.name ?? null,
    onSentence: (sentence) => latest.current?.sentence(sentence),
  });
  const speech = ({ listening: "on", off: "off", unsupported: "unsupported", error: "error" } as const)[hearing.status];
  const interim = hearing.interim;
  const box: Box | null = detection.box;
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
    return { type: "graphic", preset: "compose", data: { layers: fillMotion(m, { name: p?.name, price: p?.price, code: p?.id, shop: plan.style.shop }) }, theme: kit?.theme.look, ttl: m.seconds * 1000, aiName: m.name };
  }
  /** The AI-designed motion for a kit moment: the kit's pick, else rotate through the moment's motions (never the same twice). */
  function customForMoment(moment: CustomMotion["moment"], p: LiveProduct | null): OverlayEvent | null {
    const list = (kit?.custom ?? []).filter((m) => m.moment === moment && (p || !customNeedsProduct(m)));
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
  function enqueue(item: Queued, cooldown = 0) {
    if (cooldown && Date.now() - (lastByKey.current.get(item.key) ?? -1e9) < cooldown) return;
    if (queue.current.some((q) => q.key === item.key)) return;
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
    const { aiName, ...event } = item.event;
    send(event);
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
    if (kit && moment) return { type: "graphic", preset: kit.moments[moment], data, ...at, image: p ? imageUrl(p) : undefined, theme: kit.theme.look, ttl: 2200 };
    return { type: kind, payload: kind === "product_card" ? { ...data, ...at, image: p ? imageUrl(p) : undefined } : data, ttl: 2200 };
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
  function goSegment(index: number) {
    if (!segments.length) return;
    const i = Math.max(0, Math.min(segments.length - 1, index));
    setSegIndex(i);
    setSegStartSec(Math.floor(Date.now() / 1000));
    log("ผู้กำกับ", t("เข้าช่วง") + ` ${i + 1}: ${segments[i].title}`);
    const next = products.find((p) => p.id === segments[i].productId) ?? null;
    if (liveRef.current) enqueue({
      event: customForMoment("transition", next) ?? { type: "graphic", preset: kit?.moments.transition || "iris-swap", data: { kicker: "ต่อไป", text: segments[i].title, ...productData(next), name: next?.name ?? segments[i].title }, x: 0.5, y: 0.5, theme: kit?.theme.look, ttl: 1800 },
      key: "transition", role: "Motion", text: t("เปลี่ยนช่วง") + " · " + segments[i].title,
    });
  }

  // ---------- speech ----------
  // useLiveSpeech: OpenAI transcription with the lineup as hints, then a correction pass that also names the product.
  function onHeard(heard: LiveSentence) {
    const text = (heard.corrected || heard.raw).trim();
    if (!text) return;
    finals.current = [...finals.current.filter((f) => Date.now() - f.at < 10000), { text, at: Date.now() }];
    setLines((l) => [...l.slice(-7), text]);
    if (heard.productId && pool.some((p) => p.id === heard.productId)) spoken.current = { id: heard.productId, at: Date.now() };
    if (heard.source === "openai" && heard.corrected && heard.corrected !== heard.raw) log("ซับ", `${t("แก้คำที่ได้ยิน")}: ${heard.raw} → ${heard.corrected}`);
    onSentence(text);
  }
  /** One finished sentence: cut to the motion that fits it, only showing a product that is really there or just named. */
  function onSentence(text: string) {
    const named = pool.find((x) => namesProduct(text, x));
    if (named) spoken.current = { id: named.id, at: Date.now() };
    const p = named ?? verifiedProduct() ?? spokenProduct();
    const all = cuesFromSpeech(text, p);
    if (!all.length) return onKeywords(text, p);
    const at = placement(p);
    const cue = all.filter((c) => (!c.needsProduct || p) && (!BOX_PRESETS.has(c.preset) || (c.needsProduct && at.box))).sort((a, b) => b.priority - a.priority)[0];
    if (!cue) return;
    const event: OverlayEvent = (cue.preset === "cf-keycaps" && customForMoment("callToAction", p)) || (cue.kind === "graphic"
      ? { type: "graphic", preset: cue.preset, data: { ...productData(cue.needsProduct ? p : null), ...cue.data }, ...(cue.needsProduct ? at : {}), image: cue.needsProduct && p ? imageUrl(p) : undefined, theme: kit?.theme.look, ttl: 2200 }
      : { type: cue.preset, payload: { ...cue.data, ...(cue.preset === "zoom" && at.box ? { box: at.box } : {}) }, ttl: 2200 });
    enqueue({ event, key: "cue:" + cue.preset, role: "คนตัดต่อ", text: `${t("ตัดต่อ")} · ${cue.reason} → ${cue.preset}` }, 4000);
  }
  // fallback when cuesFromSpeech has nothing; p is only a verified or just-named product, never the run-of-show's guess
  function onKeywords(text: string, p: LiveProduct | null) {
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
      enqueue({ event, key: label, role: roleFor(label), text: describe(label, p) + ` · "${text.slice(0, 32)}"` }, 4000);
    }
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
    lowEnergy.current = d.energy === "low" ? lowEnergy.current + 1 : 0;
    if (lowEnergy.current === 2) { setSuggestPoll(true); log("ผู้กำกับ", t("คนดูเริ่มเงียบ แนะนำเปิดโหวต"), "warn"); }

    if (d.teamCommand && d.teamCommand !== "none") { // an explicit order from the team, so it may use the run-of-show product
      const p = fp ?? current;
      log("ผู้กำกับ", t("ทีมสั่งด้วยเสียง") + " · " + t(LABEL[d.teamCommand as Kind] ?? (d.teamCommand === "dead_air_clip" ? "เปิดคลิปกันเงียบ" : "ช่วงถัดไป")), "action");
      if (d.teamCommand === "dead_air_clip") playClip();
      else if (d.teamCommand === "next_segment") goSegment(segIndex + 1);
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
    if (d.motion && d.motion !== "none" && (d.motionConfidence ?? 0) >= 0.5) {
      const cm = d.motion.startsWith("custom:") ? kit?.custom?.find((x) => "custom:" + x.id === d.motion) : undefined;
      if (d.motion.startsWith("custom:") && !cm) return;
      const mp = needsProduct(d.motion) ? (BOX_PRESETS.has(d.motion) ? vp : fp) : null;
      if (needsProduct(d.motion) && !mp) return;
      if (cm) return enqueue({ event: customEventFor(cm, mp), key: d.motion, role: "Motion", text: "" }, 8000);
      const at = placement(mp);
      if (BOX_PRESETS.has(d.motion) && !at.box) return;
      const text = (lines.at(-1) ?? mp?.name ?? "").slice(0, 40);
      enqueue({
        event: { type: "graphic", preset: d.motion, data: { ...productData(mp), text }, ...at, image: mp ? imageUrl(mp) : undefined, theme: kit?.theme.look, ttl: 2200 },
        key: d.motion, role: "Motion", text: t("เลือก") + ` ${d.motion} (${t("มั่นใจ")} ${pct(d.motionConfidence)})` + (mp ? " · " + mp.name : ""),
      }, 8000);
      return;
    }
    if (d.action === "none" || d.action === "product_card" || (d.actionConfidence ?? 1) < 0.5) return; // product_card is the moment above
    const kind = d.action as Kind;
    if (kind === "low_stock") return; // no real stock data to show
    if (kind === "zoom" ? !vp || !placement(vp).box : ["price_pop", "price_drop"].includes(kind) && !fp) return;
    const p = kind === "zoom" ? vp : fp;
    enqueue({ event: buildEvent(kind, p), key: kind, role: roleFor(kind), text: describe(kind, p) }, 8000);
  }

  // ---------- clock ----------
  function tick() {
    pump();
    const sec = Math.floor(Date.now() / 1000);
    setClock(sec);
    if (warning && Date.now() - warning.at > 8000) setWarning(null);
    if (!liveRef.current) { setAi((a) => (a.status === "idle" ? a : { status: "idle", id: null })); return; }
    const vp = verifiedProduct();
    const fp = vp ?? spokenProduct();
    if (detection.product) noneSince.current = Date.now();
    const status: AiStatus = !detection.running ? "watching" : vp ? "verified" : detection.product ? "confirming" : Date.now() - noneSince.current >= 3000 ? "none" : "watching";
    const seen = vp?.id ?? detection.product;
    setAi((a) => (a.status === status && a.id === seen ? a : { status, id: seen }));
    // follow the camera: a product the moment it is verified gets its card/spotlight, once per product per 15 s
    const at = Date.now();
    if (vp && at - (momentFor.current[vp.id] ?? 0) > 15000 && at - lastMoment.current > 4000) {
      momentFor.current[vp.id] = at;
      lastMoment.current = at;
      const { event, label } = productEvent(vp);
      enqueue({ event, key: "product_card", role: "ผู้กำกับ", text: `${t("กล้องยืนยัน")} ${vp.name} (${t("มั่นใจ")} ${pct(detection.confidence)}) → ${label.replace("_", "-")}` });
    }
    if (detection.product !== lastConfirmed.current) {
      lastConfirmed.current = detection.product;
      if (detection.product) log("ผู้กำกับ", t("กล้องจับสินค้าได้") + ` · ${detectedName} ${pct(detection.confidence)}`);
    }
    if (detection.error !== lastDetectError.current) {
      lastDetectError.current = detection.error;
      if (detection.error) log("ผู้กำกับ", t("Decisions AI ผิดพลาด ไลฟ์ยังเดินต่อ") + ": " + detection.error, "error");
    }
    if (segment) {
      const at = sec - segStartSec;
      segment.cues.forEach((cue, i) => {
        const key = `${segIndex}:${i}`;
        if (cue.at > at || firedCues.current.has(key)) return;
        firedCues.current.add(key);
        // a scripted product graphic waits for the product to be verified or named; the rest are about the show
        if (cue.event === "low_stock") return; // no real stock data to show
        const needs = ["product_card", "price_pop", "price_drop", "zoom"].includes(cue.event);
        if (needs && (!fp || (cue.event === "zoom" && !placement(fp).box))) { log("ผู้กำกับ", t("ข้ามคิวสคริปต์ ยังไม่เห็นสินค้าในภาพ") + " · " + t(LABEL[cue.event]), "warn"); return; }
        const cp = needs ? fp : null;
        const event = cue.event === "caption" ? buildEvent("caption", null, { text: cue.note })
          : cue.event === "product_card" && cp ? productEvent(cp).event : buildEvent(cue.event, cp);
        enqueue({ event, key: "cue:" + key, role: roleFor(cue.event), text: t("คิวสคริปต์") + " · " + describe(cue.event, cp) + (cue.note ? ` · ${cue.note}` : "") });
      });
    }
  }

  useEffect(() => { latest.current = { tick, sentence: onHeard, decision: onDecision, log }; });

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
    lastConfirmed.current = null;
    lastDetectError.current = null;
    verif.current = null;
    spoken.current = null;
    lastMoment.current = 0;
    momentFor.current = {};
    noneSince.current = Date.now();
    setSuggestPoll(false);
    if (cameraError) setCameraTry((n) => n + 1);
    // the sting and the theme go out now; nothing waits for detection, AI or the mic
    send({ type: "theme", payload: { accent: kit?.theme.accent ?? plan.style.accent, accent2: kit?.theme.accent2 ?? plan.style.accent2, font: plan.style.font || undefined } });
    log("ผู้กำกับ", t(mode === "local" ? "เริ่มไลฟ์ พรีวิวบนจอนี้" : "ออนแอร์ ทุกคนประจำที่"), "action");
    const shop = plan.style.shop || "SnapPromo";
    lastBig.current = 0;
    play({
      event: customForMoment("intro", null) ?? { type: "graphic", preset: kit?.moments.intro || "blinds-sting", data: { text: kit?.sting.headline || shop, sub: kit?.sting.kicker, kicker: "LIVE", title: kit?.sting.headline || shop, name: shop }, theme: kit?.theme.look, ttl: 1600 },
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
  const boxVerified = !!detection.product; // a box with a confirmed product: the grounding model matched it to a catalog photo
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
    ...(mode === "obs" ? [{
      icon: MonitorPlay, label: "OBS Browser Source", short: "OBS",
      status: (obsConnected == null ? "err" : obsConnected > 0 ? "ok" : "warn") as Status,
      detail: obsConnected == null ? t("เช็กสถานะไม่ได้") : obsConnected > 0 ? t("เชื่อมต่อแล้ว") + ` ${obsConnected} ${t("จอ")}` : t("รอ Browser Source เชื่อมต่อ"),
    }] : []),
  ];
  const statusWord: Record<Status, string> = { ok: t("พร้อม"), warn: t("รอ"), err: t("มีปัญหา"), off: t("ยังไม่เริ่ม") };
  const nextSegment = segments[segIndex + 1];
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
    {products.length > 0 && !lineup.length && <p className="cr-hint">{t("ยังไม่ได้เลือกสินค้าเข้าไลฟ์ เลือกได้ที่ขั้นตอน 2 สไตล์และลำดับไลฟ์")}</p>}

    <div className="cr-layout">
      <div className="cr-stage">
        <div className="cr-screen">
          <video ref={videoRef} autoPlay muted playsInline onLoadedMetadata={(e) => setVideoAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight || 16 / 9)} />
          {view && <div className="cr-box" data-verified={boxVerified || undefined} style={{ left: `${view.x * 100}%`, top: `${view.y * 100}%`, width: `${view.w * 100}%`, height: `${view.h * 100}%` }}>
            <span>{boxVerified ? `${detectedName || t("สินค้า")} ✓` : t("กำลังยืนยัน")}</span>
          </div>}
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

        <section className="cr-panel cr-prompter" aria-label={t("สคริปต์ผู้กำกับ")}>
          {!segment ? <p className="cr-quiet">{t("ยังไม่มีสคริปต์ ให้ AI เขียนได้ที่ขั้นตอน 3 เตรียมคลิปและ motion")}</p> : <>
            <div className="cr-prompter-head">
              <div className="cr-seg">
                <span className="cr-seg-count">{t("ช่วง")} {segIndex + 1}/{segments.length}</span>
                <h2 className="cr-seg-title">{segment.title}</h2>
              </div>
              <span className="cr-countdown" data-late={(live && remaining <= 10) || undefined} aria-label={t("เวลาที่เหลือของช่วงนี้")}>{mmss(remaining)}</span>
            </div>
            <progress className="cr-progress" max={segment.seconds} value={Math.min(segment.seconds, inSegment)} aria-label={t("เวลาของช่วงนี้")} />
            <p className="cr-opening">{segment.opening}</p>
            {segment.talkingPoints.length > 0 && <ul className="cr-points">{segment.talkingPoints.map((point, i) => <li key={i}>{point}</li>)}</ul>}
            {segment.callToAction && <p className="cr-cta">{segment.callToAction}</p>}
            {segment.cues.length > 0 && <p className="cr-cues">{segment.cues.map((c, i) => <span key={i} data-fired={firedCues.current.has(`${segIndex}:${i}`) || undefined}>{mmss(c.at)} {t(LABEL[c.event])}</span>)}</p>}
            <div className="cr-prompter-nav">
              <button type="button" className="cr-btn" onClick={() => goSegment(segIndex - 1)} disabled={segIndex === 0}><ChevronLeft size={16} aria-hidden />{t("ย้อนกลับ")}</button>
              <button type="button" className="cr-btn cr-next" onClick={() => goSegment(segIndex + 1)} disabled={!nextSegment}>
                <span>{t("ถัดไป")}{nextSegment && <span className="cr-quiet"> · {nextSegment.title}</span>}</span><ChevronRight size={16} aria-hidden />
              </button>
            </div>
            {!plan.script && <p className="cr-quiet cr-small">{t("ลำดับอัตโนมัติจากรายการสินค้า ให้ AI เขียนสคริปต์เต็มได้ที่ขั้นตอน 3")}</p>}
          </>}
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

      {segments.length > 0 && <section className="cr-sheet-sec" aria-labelledby="cr-sec-rundown">
        <h3 id="cr-sec-rundown">{t("ลำดับไลฟ์")}{plan.script && <span className="cr-quiet"> · {plan.script.title}</span>}</h3>
        <ol className="cr-rundown">
          {segments.map((s, i) => <li key={i} aria-current={i === segIndex ? "step" : undefined} data-done={i < segIndex || undefined}>
            <button type="button" onClick={() => goSegment(i)}>
              <span className="cr-run-num">{i + 1}</span><span className="cr-run-title">{s.title}</span>
              <span className="cr-run-time">{i === segIndex ? mmss(remaining) : mmss(s.seconds)}</span>
            </button>
          </li>)}
        </ol>
      </section>}

      <section className="cr-sheet-sec" aria-labelledby="cr-sec-clips">
        <h3 id="cr-sec-clips">{t("คลิปกันเงียบ")}</h3>
        <div className="cr-clips">
          {plan.clips.length ? plan.clips.map((clip) => <button key={clip.fileId} type="button" className="cr-btn" onClick={() => {
            send({ type: "clip", fileId: clip.fileId });
            log("คนตัดต่อ", t("เปิดคลิปกันเงียบ") + " · " + clip.name, "action");
          }}><Film size={15} aria-hidden />{clip.name}</button>) : <p className="cr-quiet">{t("ยังไม่มีคลิปกันเงียบ เตรียมได้ที่ขั้นตอน 3")}</p>}
        </div>
      </section>

      <section className="cr-sheet-sec" aria-labelledby="cr-sec-transcript">
        <h3 id="cr-sec-transcript">{t("ถอดเสียงสด")}</h3>
        <p className="cr-transcript">
          {lines.length || interim ? <>{lines.slice(-4).join(" ")} <span className="cr-interim">{interim}</span></>
            : <span className="cr-quiet">{t(speech === "unsupported" ? "การถอดเสียงใช้ได้เฉพาะ Google Chrome" : "ข้อความที่พูดจะขึ้นที่นี่เมื่อเริ่มไลฟ์")}</span>}
        </p>
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
