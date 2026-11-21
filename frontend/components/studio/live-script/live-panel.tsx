"use client";

import { Gift, Info, Lightbulb, LoaderCircle, Mic, MicOff, Package, Percent, Tag, TriangleAlert, Zap } from "lucide-react";
import type { CSSProperties } from "react";
import { useLanguage } from "@/components/language-provider";
import { SIZES, type Cue, type Show, type Suggestion, type TextSize } from "./api";
import { CUE_LABEL, STAGE_LABEL, WARNING_LABEL } from "./labels";
import { PlanView } from "./plan-view";
import { ReplyBox } from "./reply-box";
import type { useListening } from "./use-listening";

export type Listen = ReturnType<typeof useListening>;

const CUE_ICON: Record<Cue, typeof Tag> = { price: Tag, promo: Percent, gift: Gift, flash: Zap, product: Package };
const SIZE_LABEL: Record<TextSize, string> = { s: "เล็ก", m: "กลาง", l: "ใหญ่" };

/** What to say next, as large as the seller needs it: part of the live, what it is about, what to show, then the lines. */
function Hero({ current, listen }: { current: Suggestion | null; listen: Listen }) {
  const { t } = useLanguage();
  if (!current) {
    return <p className="ls-empty">{t(listen.listening ? "เริ่มพูดได้เลย ระบบจะบอกว่าควรพูดอะไรต่อ" : "กดเริ่มฟัง แล้วพูดตามปกติ ระบบจะบอกว่าควรพูดอะไรต่อ")}</p>;
  }
  const Icon = current.cue ? CUE_ICON[current.cue] : null;
  const subject = current.productName ?? current.topic;
  const warning = current.warning;
  return <div className="ls-hero" data-hesitation={current.hesitation ? "true" : undefined}>
    <div className="ls-hero-head">
      <span className="ls-tag-chip">{t(STAGE_LABEL[current.stage])}</span>
      {subject && <span className="ls-subject">{subject}</span>}
      {Icon && current.cue && <span className="ls-tag-chip ls-cue"><Icon size={15} aria-hidden />{t(CUE_LABEL[current.cue])}</span>}
      {current.hesitation && <span className="ls-tag-chip ls-nudge"><Lightbulb size={15} aria-hidden />{t("พูดต่อจากนี้ได้เลย")}</span>}
    </div>
    <ol className="ls-say">
      {current.next.map((line, n) => <li key={`${n}-${line}`}>{line}</li>)}
    </ol>
    {warning && <div className="ls-warning" data-level={warning.level} role="note">
      {warning.level === "risk" ? <TriangleAlert size={20} aria-hidden /> : <Info size={20} aria-hidden />}
      <p><b>{t(WARNING_LABEL[warning.level])}</b> {warning.text}</p>
    </div>}
  </div>;
}

function Strip({ listen, size, onSize }: { listen: Listen; size: TextSize; onSize: (size: TextSize) => void }) {
  const { t } = useLanguage();
  return <div className="ls-strip">
    {listen.listening
      ? <span className="vs-chip ls-live" data-state="live"><Mic size={15} aria-hidden />{t("กำลังฟัง")}</span>
      : listen.busy
        ? <span className="vs-chip" data-state="running"><LoaderCircle className="animate-spin" size={14} aria-hidden />{t(listen.status === "stopping" ? "กำลังหยุด" : "กำลังเริ่ม")}</span>
        : <span className="vs-chip"><MicOff size={15} aria-hidden />{t("ยังไม่ได้ฟัง")}</span>}
    {listen.listening && <span className="ls-meter" aria-hidden><i style={{ "--lv": listen.level } as CSSProperties} /></span>}
    {listen.reconnecting && <span className="vs-chip" data-state="running" role="status"><LoaderCircle className="animate-spin" size={14} aria-hidden />{t("กำลังเชื่อมต่อใหม่")}</span>}
    <div className="ls-size" role="radiogroup" aria-label={t("ขนาดตัวอักษร")}>
      <div className="vs-seg ls-size-seg">
        {SIZES.map((s) => <label key={s}>
          <input type="radio" name="ls-size" value={s} checked={size === s} onChange={() => onSize(s)} />
          <span>{t(SIZE_LABEL[s])}</span>
        </label>)}
      </div>
    </div>
  </div>;
}

/** The live phase of the page: the strip, the suggestion, what was heard, the stream switch, the chat helper and all lines. */
export function LivePanel({ show, listen, size, onSize, onNew }: { show: Show; listen: Listen; size: TextSize; onSize: (size: TextSize) => void; onNew: () => void }) {
  const { t } = useLanguage();
  const { current, history } = listen.suggestions;
  const title = show.product?.name;

  return <section className="ls-panel" aria-label={t("บทไลฟ์")}>
    <div className="ls-title-row">
      <h2 className="ls-title">{title ?? t("บทไลฟ์")}</h2>
      <button type="button" className="vs-link" onClick={onNew} disabled={listen.busy || listen.listening}>{t("สร้างใหม่")}</button>
    </div>

    <Strip listen={listen} size={size} onSize={onSize} />
    {listen.listening && <p className="vs-hint">{t("ไมค์เปิดอยู่ เสียงของคุณถูกส่งไปถอดเป็นข้อความ แนะนำให้ใช้หูฟัง เสียงจากลำโพงจะได้ไม่ย้อนเข้าไมค์")}</p>}

    <div className="ls-stage" data-size={size} aria-live="polite" aria-atomic="false">
      <Hero current={current} listen={listen} />
      {listen.pending && <span className="ls-thinking" aria-hidden><LoaderCircle className="animate-spin" size={14} />{t("กำลังคิดประโยคต่อไป")}</span>}
      {history.length > 0 && <ol className="ls-history" aria-label={t("ที่แนะนำไปก่อนหน้านี้")}>
        {history.map((item, n) => <li key={`${item.id}-${n}`}>
          <span>{t(STAGE_LABEL[item.stage])}</span>{item.next[0]}
        </li>)}
      </ol>}
    </div>

    <div className="ls-heard">
      <span className="vs-label">{t("ที่ได้ยิน")}</span>
      {listen.lines.length === 0
        ? <p className="ls-quiet">{t(listen.listening ? "ยังไม่ได้ยินเสียง ลองพูดได้เลย" : "ข้อความที่พูดจะขึ้นตรงนี้")}</p>
        : <ul>{listen.lines.map((line) => <li key={line.id} data-final={line.final ? "true" : "false"}>{line.text}</li>)}</ul>}
    </div>

    {listen.hint && <p className="vs-hint" role="status">{t(listen.hint)}</p>}

    <div className="ls-stream">
      <label className="ls-switch">
        <input type="checkbox" role="switch" checked={listen.showOnStream} onChange={(event) => listen.setShowOnStream(event.target.checked)} />
        <span className="ls-switch-track" aria-hidden />
        <span>{t("แสดงบนสตรีม")}</span>
      </label>
      <p className="vs-hint">{t(listen.showOnStream ? "เปิดอยู่ ผู้ชมเห็นข้อความเดียวกับที่คุณเห็น" : "ปิดอยู่ มีแต่คุณที่เห็นบทแนะนำ")}</p>
    </div>

    <ReplyBox showId={show.id} />

    {show.verified === false && <p className="vs-hint">{t("ยังตรวจที่มาของข้อมูลในบทไม่ได้ ตรวจข้อมูลสำคัญอีกครั้งก่อนพูด")}</p>}
    {show.playbook && <details className="vs-more ls-all">
      <summary>{t("ดูบททั้งหมด")}</summary>
      <PlanView playbook={show.playbook} warnings={show.warnings ?? []} />
    </details>}
    <p className="vs-hint">{t("กดเว้นวรรคเพื่อเริ่มหรือหยุดฟัง")}</p>
  </section>;
}
