"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, CircleAlert, LoaderCircle, RefreshCw, WandSparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { LiveApiError, type Show, cleanOffer, liveApi } from "@/components/studio/live-script/api";
import { PlanView } from "@/components/studio/live-script/plan-view";
import { type LivePlan, type LiveProduct, productImage } from "@/lib/live-plan";
import type { StepProps } from "./live-studio";
import "../studio/live-script/live-script.css";

const POLL_MS = 2500;

/** A product photo as a small jpeg data URL (the backend takes only data URLs under 600 KB); null when it cannot be read. */
async function photo(fileId: string): Promise<string | null> {
  try {
    const response = await fetch(productImage(fileId));
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.8);
    return url.length < 600_000 ? url : null;
  } catch { return null; }
}

/** Start Yok's live-script playbook for one product (brief from the catalog + shop style, up to 2 photos). */
export async function buildShow(product: LiveProduct, style: LivePlan["style"]): Promise<Show> {
  const brief = [
    `สินค้า: ${product.name}`, product.description && `รายละเอียด: ${product.description}`, product.distinct && `จุดเด่น: ${product.distinct}`,
    style.shop && `ร้าน: ${style.shop}`, style.tone && `น้ำเสียงพิธีกร: ${style.tone}`,
  ].filter(Boolean).join("\n");
  const images = (await Promise.all(product.images.slice(0, 2).map(photo))).filter((x): x is string => !!x);
  return liveApi.create({ brief, images, offer: cleanOffer({ price: `${product.price} บาท` }) });
}

export function ProductShows({ plan, setPlan, products }: Pick<StepProps, "plan" | "setPlan" | "products">) {
  const { t } = useLanguage();
  const [shows, setShows] = useState<Record<string, Show>>({}); // by product id
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [starting, setStarting] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const ids = plan.shows ?? {};
  const idsRef = useRef(ids);
  idsRef.current = ids;

  const refresh = useCallback(async (productId: string, showId: string) => {
    try {
      const show = await liveApi.get(showId);
      setShows((s) => ({ ...s, [productId]: show }));
    } catch (error) {
      if (error instanceof LiveApiError && error.status === 404) {
        setPlan((p) => { const rest = { ...p.shows }; if (rest[productId] === showId) delete rest[productId]; return { ...p, shows: rest }; });
        setShows((s) => { const rest = { ...s }; delete rest[productId]; return rest; });
      }
    }
  }, [setPlan]);

  // On mount: load every saved show. Then: poll the ones still running.
  useEffect(() => { for (const [productId, showId] of Object.entries(idsRef.current)) void refresh(productId, showId); }, [refresh]);
  const running = Object.entries(ids).filter(([productId]) => shows[productId]?.status === "running").map(([productId]) => productId).join(",");
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => { for (const productId of running.split(",")) { const id = idsRef.current[productId]; if (id) void refresh(productId, id); } }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);

  const create = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    setStarting((s) => new Set(s).add(productId));
    setErrors((e) => { const rest = { ...e }; delete rest[productId]; return rest; });
    try {
      const show = await buildShow(product, plan.style);
      setShows((s) => ({ ...s, [productId]: show }));
      setPlan((p) => ({ ...p, shows: { ...p.shows, [productId]: show.id } }));
    } catch (error) {
      setErrors((e) => ({ ...e, [productId]: error instanceof Error ? error.message : "เกิดข้อผิดพลาด" }));
    } finally {
      setStarting((s) => { const rest = new Set(s); rest.delete(productId); return rest; });
    }
  };

  const rows = plan.lineup.flatMap((item) => { const product = products.find((p) => p.id === item.productId); return product ? [product] : []; });
  const missing = rows.filter((p) => !shows[p.id] && !ids[p.id] && !starting.has(p.id));
  // a seller new to lives should not have to know this exists: missing playbooks start on their own, once
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !missing.length) return;
    auto.current = true;
    missing.forEach((p) => void create(p.id));
  });
  const busy = starting.size > 0 || Object.values(shows).some((s) => s.status === "running");

  return <section className="vs-card" aria-labelledby="ls-shows-title" aria-busy={busy}>
    <div className="ls-card-head">
      <div><h3 id="ls-shows-title">{t("บทพูดละเอียดรายสินค้า (AI)")}</h3><p>{t("ไม่บังคับ ไลฟ์ได้ตามปกติถ้าไม่สร้าง บทนี้ใช้แนะนำประโยคถัดไประหว่างไลฟ์")}</p></div>
      <button type="button" className="vs-btn" disabled={missing.length === 0} onClick={() => missing.forEach((p) => void create(p.id))}>
        <WandSparkles size={16} aria-hidden />{t("สร้างทุกสินค้า")}
      </button>
    </div>
    <p className="ls-sr-status" role="status">{busy ? t("กำลังสร้าง") : ""}</p>
    {rows.length === 0 && <div className="vs-row"><p className="vs-hint">{t("เพิ่มสินค้าในไลฟ์ก่อน")}</p></div>}
    {rows.map((product) => {
      const show = shows[product.id];
      const working = starting.has(product.id) || show?.status === "running";
      const state = working ? "running" : show?.status ?? (ids[product.id] ? "running" : "idle");
      const label = working ? `${t("กำลังสร้าง")}${show && show.stepCount ? ` ${show.stepIndex}/${show.stepCount}` : ""}`
        : show?.status === "ready" ? t("พร้อม") : show?.status === "error" ? t("ผิดพลาด") : t("ยังไม่สร้าง");
      const error = errors[product.id] ?? (show?.status === "error" ? show.error : null);
      const ready = show?.status === "ready" && show.playbook;
      return <div className="vs-row" key={product.id}>
        <div className="ls-card-head" style={{ padding: 0 }}>
          <strong>{product.name}</strong>
          <span className="vs-chip" data-state={state}>{label}</span>
          <span style={{ flex: 1 }} />
          {ready && <button type="button" className="vs-btn" aria-expanded={open === product.id} onClick={() => setOpen(open === product.id ? null : product.id)}>
            <ChevronDown size={16} aria-hidden />{t("ดูบท")}
          </button>}
          <button type="button" className="vs-btn" disabled={working} aria-label={`${t(show ? "สร้างใหม่" : "สร้าง")} ${product.name}`} onClick={() => void create(product.id)}>
            {working ? <LoaderCircle className="animate-spin" size={16} aria-hidden /> : show ? <RefreshCw size={16} aria-hidden /> : <WandSparkles size={16} aria-hidden />}
            {t(show ? "สร้างใหม่" : "สร้าง")}
          </button>
        </div>
        {error && <div className="vs-notice" data-tone="error" role="alert"><span className="vs-notice-icon" aria-hidden><CircleAlert size={18} /></span><p>{t(error)}</p></div>}
        {ready && open === product.id && <PlanView playbook={show.playbook!} warnings={show.warnings ?? []} />}
      </div>;
    })}
  </section>;
}
