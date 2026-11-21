"use client";

import { AlertCircle, Check, Clock, LoaderCircle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useLanguage } from "@/components/language-provider";
import { api, host, useLive } from "../script/api";
import { classifyLinks, PLATFORM_NAME } from "../script/links";
import type { Profile, Source } from "../script/types";
import { cleanTitle, Notice } from "./kit";
import { LinkInput } from "./link-input";

// What the server reports while it reads one clip, grouped into the four stages the user sees.
const STAGES = [
  { label: "อ่านคลิป", steps: ["ดึงข้อมูลคลิป"] },
  { label: "คำบรรยาย", steps: ["ดึงคำบรรยายของคลิป"] },
  { label: "10 วินาทีแรก", steps: ["ดาวน์โหลดช่วงเปิดคลิป", "ถอดเสียงด้วย Whisper"] },
  { label: "ถอดฮุก", steps: ["วิเคราะห์ฮุกและโครงสร้างคลิป"] },
];

function stageOf(step: string | null): number {
  const found = STAGES.findIndex((s) => step !== null && s.steps.includes(step));
  return found === -1 ? 0 : found;
}

function ClipLine({ source, running, onRemove }: { source: Source; running: boolean; onRemove: () => void }) {
  const { t } = useLanguage();
  const stage = stageOf(source.step);
  const title = source.video?.title ?? host(source.url);
  const icon = source.status === "running" ? <LoaderCircle className="animate-spin" size={16} aria-label={t("กำลังทำงาน")} />
    : source.status === "done" ? <Check size={16} aria-label={t("วิเคราะห์แล้ว")} />
    : source.status === "error" ? <AlertCircle size={16} aria-label={t("ไม่สำเร็จ")} />
    : <Clock size={16} aria-label={t("รอคิว")} />;

  return <li className="vs-clip" data-state={source.status}>
    <span className="vs-clip-icon">{icon}</span>
    <span className="vs-clip-body">
      <a className="vs-clip-title" href={source.url} target="_blank" rel="noreferrer" title={title}>{cleanTitle(title)}</a>
      <span className="vs-clip-sub">
        {PLATFORM_NAME[source.platform]}
        {source.status === "running" && <span>{t(STAGES[stage]?.label ?? "อ่านคลิป")}</span>}
        {source.status === "pending" && <span>{t("รอคิว")}</span>}
        {source.error && <span role="alert">{source.error}</span>}
      </span>
      {source.status === "running" && <span className="vs-track" aria-hidden>
        {STAGES.map((s, n) => <i key={s.label} data-state={n < stage ? "done" : n === stage ? "now" : "next"} />)}
      </span>}
    </span>
    {!running && <button type="button" className="vs-remove" aria-label={`${t("เอาคลิปนี้ออก")} ${cleanTitle(title)}`} onClick={onRemove}><Trash2 size={16} aria-hidden /></button>}
  </li>;
}

type ViewProps = {
  profile: Profile; maxClips: number; scriptCount: number; busy: boolean; problem: string;
  links: string; name: string; confirming: boolean;
  onLinks: (value: string) => void; onName: (value: string) => void; onConfirming: (value: boolean) => void;
  onAdd: () => void; onAnalyze: (redo?: boolean) => void; onRename: () => void; onRemove: () => void; onDropClip: (sourceId: string) => void;
};

/**
 * What the user sees of the chosen style, kept to what must be acted on: progress while it reads, a notice when it
 * needs a rerun, and one quiet Manage row for everything else. A ready style shows nothing more than that row.
 * It holds no state of its own, so every state of the style can be drawn from props.
 */
export function ActiveStyleView({ profile, maxClips, scriptCount, busy, problem, links, name, confirming, onLinks, onName, onConfirming, onAdd, onAnalyze, onRename, onRemove, onDropClip }: ViewProps) {
  const { t } = useLanguage();
  const running = profile.status === "running";
  const total = profile.sources.length;
  const finished = profile.sources.filter((s) => s.status === "done" || s.status === "error").length;
  const insights = profile.insights;
  const ready = profile.status === "ready" && Boolean(insights);
  const stale = profile.status === "draft" && Boolean(insights);
  const analyzeLabel = profile.status === "error" ? "ลองวิเคราะห์อีกครั้ง" : stale ? "วิเคราะห์ใหม่" : "เริ่มวิเคราะห์";

  const known = profile.sources.map((s) => s.url);
  const room = Math.max(0, maxClips - total);
  const addable = classifyLinks(links, known, room);

  const retry = <button type="button" className="vs-btn" disabled={busy} onClick={() => onAnalyze()}>{t(analyzeLabel)}</button>;
  const clips = <ul className="vs-clips">
    {profile.sources.map((s) => <ClipLine key={s.id} source={s} running={running} onRemove={() => onDropClip(s.id)} />)}
  </ul>;

  return <div className="vs-active" data-state={profile.status}>
    {running && <>
      <div className="vs-progress" aria-live="polite">
        <span>{t(profile.step ?? "กำลังทำงาน")}</span>
        <span>{finished} {t("จาก")} {total}</span>
        <div className="vs-track-bar"><i style={{ "--p": total ? finished / total : 0 } as CSSProperties} /></div>
      </div>
      {clips}
    </>}

    {profile.status === "error" && <Notice tone="error" action={retry}>{profile.error ?? t("วิเคราะห์ไม่สำเร็จ")}</Notice>}
    {stale && <Notice tone="info" action={retry}>{t("คลิปเปลี่ยนไป ต้องวิเคราะห์ใหม่")}</Notice>}
    {profile.status === "draft" && !stale && total > 0 && <Notice tone="info" action={retry}>{t("ยังไม่ได้วิเคราะห์")}</Notice>}

    <details className="vs-more" open={total === 0 || undefined}>
      <summary><span>{t("จัดการ")}</span><span className="vs-more-count">{total > 0 && (total === 1 ? t("1 คลิป") : `${total} ${t("คลิป")}`)}</span></summary>
      <div className="vs-manage">
        {!running && total > 0 && clips}

        <div className="vs-manage-row">
          <LinkInput value={links} onChange={onLinks} known={known} room={room} disabled={running || busy} label={t("เพิ่มลิงก์")} rows={3} />
          <button type="button" className="vs-btn" disabled={running || busy || addable.accepted.length === 0} onClick={onAdd}>{t("เพิ่ม")}</button>
        </div>

        <div className="vs-field">
          <label htmlFor={`vs-rename-${profile.id}`}>{t("ชื่อสไตล์")}</label>
          <div className="vs-inline">
            <input id={`vs-rename-${profile.id}`} value={name} maxLength={80} disabled={busy} onChange={(event) => onName(event.target.value)} />
            <button type="button" className="vs-btn" disabled={busy || !name.trim() || name.trim() === profile.name} onClick={onRename}>{t("บันทึก")}</button>
          </div>
        </div>

        <div className="vs-actions">
          {ready && !running && <button type="button" className="vs-btn" disabled={busy} onClick={() => onAnalyze(true)}>{t("วิเคราะห์ใหม่ทั้งหมด")}</button>}
          {!confirming && <button type="button" className="vs-btn" data-tone="danger" disabled={running || busy} onClick={() => onConfirming(true)}>{t("ลบสไตล์นี้")}</button>}
        </div>

        {confirming && <div className="vs-confirm" role="alertdialog" aria-label={t("ยืนยันการลบ")}>
          <p>{scriptCount > 0 ? `${t("ลบสไตล์นี้และสคริปต์")} ${scriptCount} ${t("รายการ")}` : t("ลบสไตล์นี้")} {t("ลบแล้วกู้คืนไม่ได้")}</p>
          <div className="vs-actions">
            <button type="button" className="vs-btn" data-tone="danger" disabled={busy} onClick={onRemove}>{t("ยืนยันลบ")}</button>
            <button type="button" className="vs-btn" disabled={busy} onClick={() => onConfirming(false)}>{t("ยกเลิก")}</button>
          </div>
        </div>}
        {problem && <Notice tone="error">{t(problem)}</Notice>}
      </div>
    </details>
  </div>;
}

/** Loads the chosen style, keeps it fresh while it is being analysed, and wires the view to the API. */
export function ActiveStyle({ profileId, maxClips, onSummary, onDeleted }: {
  profileId: string; maxClips: number; onSummary: (profile: Profile) => void; onDeleted: () => void;
}) {
  const { t } = useLanguage();
  const { data: profile, error, refresh, setData } = useLive(useCallback(() => api.profile(profileId), [profileId]));
  const [links, setLinks] = useState("");
  // The rename field follows the saved name until the user types, so no effect has to copy it over.
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scriptCount, setScriptCount] = useState(0);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (profile) onSummary(profile);
  }, [profile, onSummary]);

  useEffect(() => {
    api.projects(profileId).then((list) => setScriptCount(list.length)).catch(() => undefined);
  }, [profileId]);

  if (error && !profile) return <Notice tone="error">{t(error)}</Notice>;
  if (!profile) return <p className="vs-hint" role="status">{t("กำลังโหลด")}</p>;

  const known = profile.sources.map((s) => s.url);
  const room = Math.max(0, maxClips - profile.sources.length);
  const addable = classifyLinks(links, known, room);

  async function guard(work: () => Promise<void>) {
    setBusy(true);
    setProblem("");
    try { await work(); } catch (e) { setProblem(e instanceof Error ? e.message : "ลองอีกครั้ง"); } finally { setBusy(false); }
  }

  return <ActiveStyleView
    profile={profile} maxClips={maxClips} scriptCount={scriptCount} busy={busy} problem={problem}
    links={links} name={typed ?? profile.name} confirming={confirming}
    onLinks={setLinks} onName={setTyped} onConfirming={setConfirming}
    onAdd={() => void guard(async () => { const result = await api.addSources(profile.id, addable.accepted); setData(result.profile); setLinks(""); })}
    onAnalyze={(redo = false) => void guard(async () => { await api.analyze(profile.id, redo); await refresh(); })}
    onRename={() => void guard(async () => { setData(await api.renameProfile(profile.id, (typed ?? profile.name).trim())); setTyped(null); })}
    onRemove={() => void guard(async () => { await api.deleteProfile(profile.id); onDeleted(); })}
    onDropClip={(sourceId) => void guard(async () => setData((await api.removeSource(profile.id, sourceId)).profile))}
  />;
}
