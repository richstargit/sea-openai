"use client";

import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Clapperboard, Film, Focus, ImagePlus, LoaderCircle, Pencil, Send, Square, Type, WandSparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { Asset, Project } from "@/lib/editor/model";
import type { createEditorStorage } from "@/lib/editor/storage";

type Exchange = { clipId: string | null; prompt: string; summary: string };

type Props = {
  project: Project;
  assets: Asset[];
  selectedId?: string;
  frame: number;
  proposeEdit: ReturnType<typeof createEditorStorage>["proposeEdit"];
  onApply: (original: Project, next: Project) => void;
  onImport: () => void;
};

export function PromptEditor({ project, assets, selectedId, frame, proposeEdit, onApply, onImport }: Props) {
  const { t, language } = useLanguage();
  const [scope, setScope] = useState("project");
  const [prompt, setPrompt] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const current = useRef(project);
  const request = useRef<AbortController | null>(null);
  useLayoutEffect(() => { current.current = project; }, [project]);
  useEffect(() => () => request.current?.abort(), []);

  const clipId = scope === "clip" ? selectedId ?? null : null;
  const conversation = exchanges.filter((exchange) => exchange.clipId === clipId);
  const previous = conversation.at(-1);
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = transcript.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [previous]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || !prompt.trim() || !project.clips.length) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setFeedback("");
    try {
      const result = await proposeEdit(project, assets, {
        prompt: prompt.trim(), clipId, playhead: frame, language,
        previousExchange: previous && { prompt: previous.prompt, summary: previous.summary },
      }, controller.signal);
      if (controller.signal.aborted) return;
      if (current.current !== project) {
        setFeedback(t("ไทม์ไลน์เปลี่ยนแล้ว ส่งคำสั่งอีกครั้งเพื่อแก้ฉบับล่าสุด"));
        return;
      }
      if (result.project) {
        onApply(project, result.project);
        setPrompt("");
      }
      setExchanges((history) => [...history, { clipId, prompt: prompt.trim(), summary: result.summary }]);
    } catch (error) {
      if (!controller.signal.aborted) setFeedback(error instanceof Error ? error.message : t("ลองอีกครั้ง"));
    } finally {
      request.current = null;
      setPending(false);
    }
  }

  const shotNumber = project.clips.findIndex((clip) => clip.id === selectedId) + 1;
  const suggestions = [
    { icon: Focus, label: "ค่อย ๆ ซูมเข้า", text: "ค่อย ๆ ซูมเข้าหาจุดสนใจของภาพ" },
    { icon: Type, label: "ขยายหัวเรื่อง", text: "เพิ่มขนาดหัวเรื่องให้อ่านง่ายขึ้น" },
  ];
  function draft(text: string) {
    setPrompt(text);
    input.current?.focus();
  }

  return <form className="editor-prompt" onSubmit={submit}>
    <div className="editor-prompt-title"><span><WandSparkles size={21} strokeWidth={1.7} /></span><h1>{t("แก้ด้วย AI")}</h1></div>
    {!project.clips.length ? <button type="button" className="editor-import" onClick={onImport}><ImagePlus size={24} /><strong>{t("เพิ่มวิดีโอหรือรูปแรกเพื่อเริ่มตัดต่อ")}</strong></button> : <>
      <div className="editor-prompt-scope" role="group" aria-label={t("ขอบเขตการแก้ไข")}>
        <button type="button" aria-pressed={scope === "project"} disabled={pending} onClick={() => { setScope("project"); setFeedback(""); }}><Film size={15} />{t("ทั้งวิดีโอ")}</button>
        <button type="button" aria-pressed={scope === "clip"} aria-label={t("ช็อตที่เลือก")} disabled={pending || !selectedId} onClick={() => { setScope("clip"); setFeedback(""); }}><Clapperboard size={15} />{t("ช็อต")} {shotNumber}</button>
      </div>
      <div ref={transcript} className="editor-prompt-conversation">
        {previous ? conversation.map((exchange, index) => <div key={index} className="editor-exchange">
          <div className="editor-user-prompt">{exchange.prompt}{exchange === previous && <button type="button" disabled={pending} aria-label={t("แก้คำสั่งล่าสุด")} title={t("แก้คำสั่งล่าสุด")} onClick={() => draft(exchange.prompt)}><Pencil size={14} /></button>}</div>
          <p><Check size={15} />{exchange.summary}</p>
        </div>) : <div className="editor-suggestions">
          <p>{t("ลองสั่งแก้ไข")}</p>
          {suggestions.map(({ icon: Icon, label, text }) => <button key={label} type="button" disabled={pending} onClick={() => draft(t(text))}>
            <Icon size={16} /><span>{t(label)}</span><ArrowUpRight size={14} />
          </button>)}
        </div>}
      </div>
      <div className="editor-composer">
        <label htmlFor="video-edit-prompt" className="sr-only">{t("แก้ด้วย AI")}</label>
        <textarea id="video-edit-prompt" ref={input} rows={3} value={prompt} maxLength={2000} readOnly={pending}
          placeholder={t("อยากแก้อะไรในวิดีโอ?")} onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }} />
        <div className="editor-composer-actions">
          {pending ? <button type="button" onClick={() => request.current?.abort()}><Square size={12} />{t("ยกเลิก")}</button>
            : <button type="submit" aria-label={t("ส่งคำสั่งแก้ไข")} disabled={!prompt.trim()}><Send size={14} />{t("ใช้คำสั่ง")}</button>}
        </div>
      </div>
      <div role="status" className="editor-prompt-status">{pending ? <><LoaderCircle size={14} className="animate-spin" />{t("กำลังแก้ไทม์ไลน์…")}</> : feedback || <span className="sr-only">{previous?.summary}</span>}</div>
    </>}
  </form>;
}
