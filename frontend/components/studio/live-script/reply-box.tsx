"use client";

import { Ban, Check, CircleHelp, LoaderCircle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { CopyButton } from "./copy-button";
import { type Reply, type ReplyStatus, liveApi } from "./api";

const KEEP = 5;
const MAX_COMMENT = 500;

const STATUS: Record<ReplyStatus, { label: string; chip: "ready" | "running" | "error" }> = {
  answered: { label: "ตอบได้", chip: "ready" },
  unknown: { label: "ต้องเช็กก่อน", chip: "running" },
  declined: { label: "ไม่ตอบ", chip: "error" },
};

type Item = { id: string; comment: string; reply: Reply };

function StatusChip({ status }: { status: ReplyStatus }) {
  const { t } = useLanguage();
  const icon = status === "answered" ? <Check size={14} aria-hidden /> : status === "unknown" ? <CircleHelp size={14} aria-hidden /> : <Ban size={14} aria-hidden />;
  return <span className="vs-chip" data-state={STATUS[status].chip}>{icon}{t(STATUS[status].label)}</span>;
}

/**
 * The chat helper: paste what a viewer wrote, get one short reply to say, with a chip that says whether it can be
 * answered from what is known. The last five stay on screen; each can be copied on its own.
 */
export function ReplyBox({ showId }: { showId: string }) {
  const { t } = useLanguage();
  const id = useId();
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  const ask = async () => {
    const text = comment.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem("");
    try {
      const reply = await liveApi.reply(showId, text);
      setItems((current) => [{ id: crypto.randomUUID(), comment: text, reply }, ...current].slice(0, KEEP));
      setComment("");
      field.current?.focus();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "ลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return <section className="ls-reply" aria-label={t("ตอบคอมเมนต์")}>
    <div className="vs-field">
      <label htmlFor={id}>{t("คอมเมนต์จากแชต")}</label>
      <textarea id={id} ref={field} className="ls-comment" rows={2} maxLength={MAX_COMMENT} value={comment} disabled={busy}
        placeholder={t("วางคอมเมนต์ของคนดู")}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void ask(); } }} />
    </div>
    <div className="vs-actions">
      <button type="button" className="vs-btn" disabled={!comment.trim() || busy} onClick={() => void ask()}>
        {busy && <LoaderCircle className="animate-spin" size={16} aria-hidden />}
        {t("ขอคำตอบ")}
      </button>
      {problem && <span className="vs-hint" role="alert">{t(problem)}</span>}
    </div>

    {items.length > 0 && <ul className="ls-replies">
      {items.map((item) => <li key={item.id} className="ls-reply-item" data-status={item.reply.status}>
        <p className="ls-reply-comment">{item.comment}</p>
        <p className="ls-reply-text">{item.reply.text}</p>
        <div className="ls-reply-foot">
          <StatusChip status={item.reply.status} />
          {item.reply.note && <span className="vs-hint">{item.reply.note}</span>}
          <CopyButton text={item.reply.text} />
        </div>
        {item.reply.basis && item.reply.basis.length > 0 && <p className="vs-hint">{t("อ้างอิงจาก")} {item.reply.basis.join(" ")}</p>}
      </li>)}
    </ul>}
  </section>;
}
