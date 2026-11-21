"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Play, Search, Sparkles, WandSparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { type CustomMotion, fillMotion, motionOn, productImage } from "@/lib/live-plan";
import type { StepProps } from "./live-studio";
import "./steps.css";
import "./motion-library.css";

const SRC = "/overlay/index.html?preview=1#" + "a".repeat(43);
const PAGE = 60;
const AI = "ai";
const GROUPS: Record<string, string> = {
  [AI]: "ออกแบบโดย AI", livecut: "LiveCut", hand: "ชี้สินค้า", deals: "ราคาและดีล", shop: "เร่งขาย", broadcast: "บรอดแคสต์", stream: "สตรีมเมอร์",
  info: "ข่าว/กีฬา/ความรู้", life: "ไลฟ์สไตล์", game: "เกม", fx: "เอฟเฟกต์", compose: "ประกอบเอง",
};
const THEMES = [["", "ตามแบบ"], ["paper", "กระดาษ"], ["ink", "หมึก"], ["pop", "ป๊อป"]] as const;

type Spec = { title?: string; place?: string; group?: string; sample?: Record<string, unknown> & { data?: Record<string, unknown> } };
type Preset = { graphic: string; theme: string; title: string };
type Win = Window & { graphicPresets?: Record<string, Preset>; graphicSpecs?: Record<string, Spec> };
type Item = { id: string; title: string; group: string; place: string; custom?: CustomMotion; graphic?: string; theme?: string };

export function MotionLibrary({ plan, setPlan, products }: StepProps) {
  const { t } = useLanguage();
  const [lib, setLib] = useState<{ presets: Record<string, Preset>; specs: Record<string, Spec> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [theme, setTheme] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<string | null>(null);
  const stage = useRef<HTMLIFrameElement>(null);
  const stageReady = useRef(false);
  const loader = useRef<HTMLIFrameElement>(null);

  // the overlay registers its presets in its own window: read them once from a hidden copy
  const readLib = useCallback(() => {
    const w = loader.current?.contentWindow as Win | null | undefined;
    const presets = w?.graphicPresets, specs = w?.graphicSpecs;
    if (presets && specs && Object.keys(presets).length) setLib({ presets, specs }); else setFailed(true);
  }, []);

  const items = useMemo<Item[]>(() => {
    const ai = (plan.kit?.custom ?? []).map((c): Item => ({ id: "custom:" + c.id, title: c.name, group: AI, place: c.moment, custom: c }));
    const built = lib ? Object.entries(lib.presets).map(([id, p]): Item => {
      const s = lib.specs[p.graphic];
      return { id, title: p.title, group: s?.group ?? "other", place: s?.place ?? "", graphic: p.graphic, theme: p.theme };
    }) : [];
    return [...ai, ...built];
  }, [lib, plan.kit?.custom]);

  const groups = useMemo(() => {
    const seen = new Set(items.map((i) => i.group));
    return [...Object.keys(GROUPS).filter((g) => seen.has(g)), ...[...seen].filter((g) => !(g in GROUPS))];
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => (group === "all" || i.group === group) && (!q || (i.title + " " + i.id).toLowerCase().includes(q)));
  }, [items, group, query]);

  const current = items.find((i) => i.id === selected) ?? null;
  const onCount = items.filter((i) => motionOn(plan, i.id)).length;
  const label = (g: string) => t(GROUPS[g] ?? g);

  const play = useCallback((item: Item | null) => {
    const win = stage.current?.contentWindow;
    if (!item || !win || !stageReady.current) return;
    const first = plan.lineup.map((l) => products.find((p) => p.id === l.productId)).find(Boolean) ?? products[0];
    const values = { name: first?.name ?? "สินค้าตัวอย่าง", price: first?.price ?? 590, code: "A01", shop: plan.style.shop || "ร้านของฉัน" };
    const img = first?.images[0] ? productImage(first.images[0]) : undefined;
    let event: Record<string, unknown>;
    if (item.custom) event = { type: "graphic", preset: "compose", data: { layers: fillMotion(item.custom, values) } };
    else {
      const sample = lib?.specs[item.graphic ?? ""]?.sample ?? {};
      event = { type: "graphic", preset: item.id, ...sample, data: { ...(sample.data ?? sample), ...values } };
      if (sample.image && img) event.image = img;
    }
    if (theme) event.theme = theme;
    win.postMessage({ source: "snappromo-control", event }, location.origin);
  }, [lib, plan.lineup, plan.style.shop, products, theme]);

  const choose = (item: Item) => { setSelected(item.id); play(item); };
  const currentId = current?.id;
  const replay = useRef(play);
  useEffect(() => { replay.current = play; });
  useEffect(() => { replay.current(items.find((i) => i.id === currentId) ?? null); }, [theme, currentId, items]);

  const setOff = (ids: string[], on: boolean) => setPlan((p) => {
    const off = new Set(p.off ?? []);
    for (const id of ids) if (on) off.delete(id); else off.add(id);
    return { ...p, off: [...off] };
  });
  const toggle = (id: string) => setOff([id], !motionOn(plan, id));

  const jumpAi = () => {
    const el = document.getElementById("ai-motion-designer");
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); el.focus({ preventScroll: true }); }
    else setGroup(AI);
  };
  const hasDesigner = typeof document !== "undefined" && !!document.getElementById("ai-motion-designer");

  const renderSwitch = (item: Item) => {
    const on = motionOn(plan, item.id);
    return <button type="button" role="switch" aria-checked={on} className="ml-switch" onClick={() => toggle(item.id)} aria-label={t("ใช้ในไลฟ์") + ": " + item.title}>
      <i aria-hidden /><span>{t("ใช้ในไลฟ์")}</span>
    </button>;
  };

  return <section className="vs ls ml" aria-label={t("คลัง Motion")}>
    <iframe ref={loader} className="ml-loader" src={SRC} title="library" tabIndex={-1} aria-hidden onLoad={readLib} />
    <header className="ls-head">
      <h3>{t("คลัง Motion")}</h3>
      <p className="ls-muted">{t("ดูทุก motion ที่ระบบมี ลองเล่นดู แล้วเลือกว่าแบบไหนขึ้นในไลฟ์ของคุณได้")}</p>
      <p className="ml-count" role="status">{t("ใช้ในไลฟ์")} {onCount} {t("จาก")} {items.length}</p>
    </header>

    <div className="ml-cta vs-card">
      <span className="ls-empty-icon" aria-hidden><WandSparkles size={22} /></span>
      <div>
        <strong>{t("ให้ AI ออกแบบ motion ใหม่")}</strong>
        <p className="ls-muted">{hasDesigner ? t("AI วาด motion ให้เข้ากับร้านและสินค้าของคุณ") : t("ตัวออกแบบ AI อยู่ในขั้นตอนนี้ ด้านบนของหน้า")}</p>
      </div>
      <button type="button" className="vs-btn" onClick={jumpAi}><Sparkles size={16} aria-hidden />{t("ให้ AI ออกแบบ motion ใหม่")}</button>
    </div>

    <div className="ml-layout">
      <div className="ml-stage vs-card">
        <div className="ml-screen">
          <iframe ref={stage} src={SRC} title={t("ตัวอย่าง motion")} tabIndex={-1} onLoad={() => { stageReady.current = true; play(current); }} />
          {!current && <p>{t("เลือก motion เพื่อดูตัวอย่าง")}</p>}
        </div>
        <div className="ml-stage-info" aria-live="polite">
          {current ? <>
            <div><strong>{current.title}</strong>
              <p className="ls-muted">{label(current.group)}{current.place && " · " + current.place} · <code>{current.id}</code></p></div>
            <div className="ml-stage-act">
              <button type="button" className="vs-btn" onClick={() => play(current)}><Play size={16} aria-hidden />{t("เล่นซ้ำ")}</button>
              {renderSwitch(current)}
            </div>
          </> : <p className="ls-muted">{t("คลิกการ์ดเพื่อดูตัวอย่างด้วยสินค้าของร้านคุณ")}</p>}
        </div>
        <div className="ml-theme" role="group" aria-label={t("ธีมตัวอย่าง")}>
          {THEMES.map(([id, name]) => <button key={id} type="button" aria-pressed={theme === id} onClick={() => setTheme(id)}>{t(name)}</button>)}
        </div>
      </div>

      <div className="ml-browse">
        <div className="ml-tools">
          <label className="ml-search"><Search size={16} aria-hidden />
            <input type="search" value={query} placeholder={t("ค้นหา motion")} aria-label={t("ค้นหา motion")} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
          </label>
          <div className="ml-bulk">
            <button type="button" className="vs-btn" onClick={() => setOff(items.map((i) => i.id), true)}>{t("เปิดทั้งหมด")}</button>
            <button type="button" className="vs-btn" disabled={group === "all"} onClick={() => setOff(visible.map((i) => i.id), false)}>{t("ปิดทั้งหมดในกลุ่มนี้")}</button>
          </div>
        </div>
        <div className="ml-chips" role="group" aria-label={t("กลุ่ม")}>
          {["all", ...groups].map((g) => <button key={g} type="button" aria-pressed={group === g} onClick={() => { setGroup(g); setShown(PAGE); }}>
            {g === "all" ? t("ทั้งหมด") : label(g)}</button>)}
        </div>

        {!lib && !failed && <p className="ls-muted" role="status">{t("กำลังโหลดคลัง motion…")}</p>}
        {failed && <p className="ls-muted" role="alert">{t("โหลดคลัง motion ไม่สำเร็จ")}</p>}
        {lib && !visible.length && <p className="ls-muted">{t("ไม่พบ motion")}</p>}
        <ul className="ml-grid">
          {visible.slice(0, shown).map((item) => {
            const on = motionOn(plan, item.id);
            return <li key={item.id} className="ml-card" data-off={!on || undefined} data-selected={item.id === selected || undefined}>
              <button type="button" className="ml-card-main" aria-pressed={item.id === selected} onClick={() => choose(item)}>
                <strong>{item.title}</strong>
                <code>{item.id}</code>
                <span className="ml-chip">{label(item.group)}</span>
              </button>
              {renderSwitch(item)}
            </li>;
          })}
        </ul>
        {shown < visible.length && <button type="button" className="vs-btn ml-more" onClick={() => setShown((n) => n + PAGE)}>
          {t("โหลดเพิ่ม")} ({visible.length - shown})</button>}
      </div>
    </div>
  </section>;
}
