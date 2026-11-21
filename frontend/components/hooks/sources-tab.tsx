"use client";

import { AlertCircle, Check, Clock, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/hooks/api";
import type { Profile, Source } from "@/lib/hooks/types";
import { clock, compact, ErrorNote, host, Meta, PLATFORM_LABEL, Reveal } from "./bits";

const TOOL: Record<string, string> = {
  "agent-reach:youtube": "Agent-Reach",
  "agent-reach:subtitle": "Agent-Reach",
  "yt-dlp": "yt-dlp",
  "yt-dlp:subtitles": "yt-dlp",
  "yt-dlp:video": "yt-dlp",
  "ffmpeg:hook-microscope": "ภาพ 10 วินาทีแรก",
  "openai:transcribe": "ถอดเสียง",
};

function StatusIcon({ source }: { source: Source }) {
  if (source.status === "running") return <Spinner className="text-brand-text" />;
  if (source.status === "done") return <Check className="size-5 text-emerald-600" aria-label="วิเคราะห์แล้ว" />;
  if (source.status === "error") return <AlertCircle className="size-5 text-destructive" aria-label="ไม่สำเร็จ" />;
  return <Clock className="size-5 text-muted-foreground" aria-label="รอคิว" />;
}

function SourceRow({ source, locked, onRemove }: { source: Source; locked: boolean; onRemove: () => void }) {
  const v = source.video;
  const tools = [...new Set(source.via.map((x) => TOOL[x]).filter(Boolean))];
  const a = source.analysis;
  return (
    <AccordionItem value={source.id}>
      <AccordionTrigger className="items-center gap-4 py-4 hover:no-underline">
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[1.1875rem] font-medium">{v?.title ?? host(source.url)}</span>
          <span className="mt-0.5 block text-[0.9375rem] font-normal text-muted-foreground">
            {source.status === "running" ? (
              source.step ?? "กำลังทำงาน"
            ) : (
              <Meta>
                <>{PLATFORM_LABEL[source.platform]}</>
                {v?.author ? <>{v.author}</> : null}
                {v?.views != null ? <>ดู {compact(v.views)}</> : null}
                {v?.durationSec != null ? <>{clock(v.durationSec)}</> : null}
              </Meta>
            )}
          </span>
        </span>
        <StatusIcon source={source} />
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-4 pb-5">
        {a ? (
          <div>
            <Badge variant="wash">{a.hookLabel}</Badge>
            <p className="mt-3 text-[1.25rem] leading-snug font-medium whitespace-pre-line">{a.hookText}</p>
            <p className="mt-3 text-[0.9375rem] text-muted-foreground">{a.visualHook}</p>
          </div>
        ) : null}
        {source.error ? <ErrorNote>{source.error}</ErrorNote> : null}
        {source.warnings.map((w) => <p key={w} className="text-[0.9375rem] text-muted-foreground">{w}</p>)}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.9375rem] text-muted-foreground">{tools.length ? `ใช้ ${tools.join(" ")}` : ""}</p>
          <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={onRemove} className="text-destructive">
            <Trash2 /> เอาออก
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function SourcesTab({ profile, onChange, refresh }: { profile: Profile; onChange: (p: Profile) => void; refresh: () => Promise<unknown> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const running = profile.status === "running";
  const total = profile.sources.length;
  const finished = profile.sources.filter((s) => s.status === "done" || s.status === "error").length;
  const pending = profile.sources.filter((s) => s.status !== "done").length;
  const needsRun = total > 0 && (pending > 0 || !profile.insights);

  async function add() {
    const urls = text.split(/\s+/).filter(Boolean);
    if (!urls.length) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await api.addSources(profile.id, urls);
      onChange(result.profile);
      setText("");
      if (result.rejected.length) setNote(`ข้าม ${result.rejected.length} ลิงก์ที่ไม่ใช่ YouTube TikTok หรือ Instagram`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function analyze() {
    setError(null);
    try {
      await api.analyze(profile.id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "เริ่มวิเคราะห์ไม่ได้");
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-3xl bg-surface p-5 sm:p-6">
        <label htmlFor="links" className="text-[1.0625rem] font-semibold">วางลิงก์คลิปที่ชอบ</label>
        <Textarea
          id="links"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          disabled={running}
          placeholder="TikTok YouTube หรือ Instagram บรรทัดละลิงก์"
          className="mt-3 resize-none rounded-2xl bg-card text-base"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.9375rem] text-muted-foreground">{note ?? "ยิ่งใส่เยอะยิ่งแม่น ลอง 5 คลิปขึ้นไป"}</p>
          <Button type="button" variant="secondary" onClick={add} disabled={!text.trim() || busy || running}>เพิ่ม</Button>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {profile.status === "error" && profile.error ? <ErrorNote>{profile.error}</ErrorNote> : null}

      {running ? (
        <div aria-live="polite" className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{profile.step ?? "กำลังทำงาน"}</p>
            <p className="text-[0.9375rem] text-muted-foreground tabular-nums">{finished} จาก {total}</p>
          </div>
          <Progress value={total ? (finished / total) * 100 : 0} />
        </div>
      ) : null}

      {total === 0 ? (
        <p className="py-10 text-center text-muted-foreground">ยังไม่มีคลิป เริ่มจากวางลิงก์ด้านบน</p>
      ) : (
        <Reveal>
          <Accordion type="multiple" className="rounded-none border-t">
            {profile.sources.map((s) => (
              <SourceRow key={s.id} source={s} locked={running} onRemove={async () => onChange((await api.removeSource(profile.id, s.id)).profile)} />
            ))}
          </Accordion>
        </Reveal>
      )}

      {needsRun && !running ? (
        <div className="material fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md items-center justify-between gap-4 rounded-full border py-2 pr-2 pl-6 shadow-lg">
          <span className="font-medium">{pending} คลิปรอวิเคราะห์</span>
          <Button type="button" onClick={analyze}><Sparkles /> {profile.insights ? "วิเคราะห์ใหม่" : "เริ่มวิเคราะห์"}</Button>
        </div>
      ) : null}
    </div>
  );
}
