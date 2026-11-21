"use client";

import { ArrowLeft, Check } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, useLive } from "@/lib/hooks/api";
import type { Grade, Project, ScriptBeat } from "@/lib/hooks/types";
import { clock, CopyButton, ErrorNote, GradeChip, Meta, PageTitle, Reveal, Shell } from "./bits";
import { HookSheet } from "./hook-sheet";
import { ResearchSection } from "./research";
import { VoiceSection } from "./voice-section";

const STAGES = [
  "ดูรูปสินค้าและโน้ต",
  "ค้นข้อมูลสินค้าด้วย Agent-Reach",
  "สรุปข้อเท็จจริงและจุดขาย",
  "คิดฮุกจากสไตล์ในโปรไฟล์",
  "เขียนสคริปต์ตั้งแต่เปิดจนจบคลิป",
];

const SECTION: Record<ScriptBeat["section"], string> = {
  hook: "ฮุก",
  problem: "ปัญหา",
  solution: "ทางออก",
  demo: "สาธิต",
  proof: "หลักฐาน",
  cta: "ปิดการขาย",
};

function Steps({ project }: { project: Project }) {
  const current = project.step?.startsWith("เขียนสคริปต์ใหม่") ? 4 : Math.max(0, STAGES.indexOf(project.step ?? ""));
  return (
    <div aria-live="polite" className="max-w-md">
      <h2 className="text-xl font-semibold tracking-tight">กำลังเขียนสคริปต์</h2>
      <ol className="mt-5 grid gap-4">
        {STAGES.map((label, n) => (
          <li key={label} className={n > current ? "flex items-center gap-3 text-muted-foreground" : "flex items-center gap-3"}>
            <span className="grid size-5 place-items-center">
              {n < current ? <Check className="size-5 text-emerald-600" aria-label="เสร็จแล้ว" /> : n === current ? <Spinner className="text-brand-text" /> : null}
            </span>
            {label}
          </li>
        ))}
      </ol>
      <div className="mt-10 grid gap-3" aria-hidden>
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-5/6 rounded-lg" />
        <Skeleton className="h-8 w-2/3 rounded-lg" />
      </div>
    </div>
  );
}

function fullText(project: Project): string {
  const s = project.script;
  if (!s) return "";
  const lines = s.beats.map((b) => `${clock(b.startSec)} ${SECTION[b.section]}\n${b.voiceover}`);
  return `${s.title}\n\n${lines.join("\n\n")}\n\n${s.caption}\n${s.hashtags.join(" ")}`;
}

function bestGrade(project: Project): Grade | null {
  const all = [...(project.hooks?.formatMatched ?? []), ...(project.hooks?.original ?? [])];
  return all.find((h) => h.text === project.chosenHook)?.grade ?? null;
}

// Keep refreshing while either the script or the voice job is working.
const projectWorking = (p: Project) => p.status === "running" || p.voice?.status === "running";

export function ScriptView({ profileId, projectId }: { profileId: string; projectId: string }) {
  const { data: project, error, setData } = useLive(useCallback(() => api.project(projectId), [projectId]), projectWorking);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error && !project) return <Shell><ErrorNote>{error}</ErrorNote></Shell>;
  if (!project) {
    return (
      <Shell>
        <Skeleton className="h-12 w-80 rounded-xl" />
        <Skeleton className="mt-10 h-96 rounded-3xl" />
      </Shell>
    );
  }

  const running = project.status === "running";
  const script = project.script;
  const grade = bestGrade(project);

  async function choose(hook: string) {
    setActionError(null);
    try {
      await api.chooseHook(projectId, hook);
      setData(await api.project(projectId));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "ทำไม่สำเร็จ");
    }
  }

  return (
    <Shell>
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href={`/hooks/${profileId}`}><ArrowLeft /> กลับไปที่โปรไฟล์</Link>
      </Button>

      <div className="mt-3">
        <PageTitle title={project.brief?.productName ?? script?.title ?? project.title}>
          {project.mock ? <Badge variant="wash">โหมดเดโม</Badge> : null}
        </PageTitle>
        {project.brief || script ? (
          <Meta className="mt-3 text-base">
            {project.brief ? <>{project.brief.category}</> : null}
            {project.brief ? <>เหมาะกับ {project.brief.audience}</> : null}
            {script ? <>ยาว {clock(script.totalSec)}</> : null}
          </Meta>
        ) : null}
      </div>

      <div className="mt-12 grid gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-x-16">
        <div className="min-w-0">
          {running && !script ? <Steps project={project} /> : null}
          {project.status === "error" && project.error ? <ErrorNote>{project.error}</ErrorNote> : null}
          {actionError ? <div className="mt-4"><ErrorNote>{actionError}</ErrorNote></div> : null}

          {script ? (
            <Reveal>
              {running ? <p className="mb-4 flex items-center gap-2 text-muted-foreground"><Spinner /> กำลังเขียนใหม่</p> : null}
              <ol className="divide-y border-y">
                {script.beats.map((b, n) => {
                  const img = b.imageIndex != null ? project.input.images[b.imageIndex] : null;
                  const isHook = b.section === "hook";
                  return (
                    <li key={`${n}-${b.section}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-4 py-6">
                      <div>
                        <p className="font-medium tabular-nums">{clock(b.startSec)}</p>
                        <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">{SECTION[b.section]}</p>
                      </div>
                      <p className={isHook ? "text-[1.75rem] leading-snug font-semibold text-balance" : "text-[1.3125rem] leading-snug"}>{b.voiceover}</p>
                      {img ? (
                        // biome-ignore lint/performance/noImgElement: stored data URL preview
                        <img src={img} alt={`รูปสินค้า ${(b.imageIndex ?? 0) + 1}`} className="size-16 rounded-xl object-cover" />
                      ) : <span />}
                    </li>
                  );
                })}
              </ol>
            </Reveal>
          ) : null}
        </div>

        {script ? (
          <aside className="grid content-start gap-10 lg:sticky lg:top-24 lg:self-start">
            <section aria-labelledby="chosen">
              <h2 id="chosen" className="font-semibold">ฮุกที่ใช้</h2>
              <div className="mt-3 flex items-start gap-3">
                {grade ? <GradeChip grade={grade} className="mt-0.5" /> : null}
                <p className="text-[1.1875rem] leading-snug font-medium whitespace-pre-line">{project.chosenHook}</p>
              </div>
              <div className="mt-4">
                <HookSheet project={project} disabled={running} onChoose={choose} onProject={setData} />
              </div>
            </section>

            <section aria-labelledby="caption">
              <h2 id="caption" className="font-semibold">แคปชั่น</h2>
              <p className="mt-3 leading-relaxed">{script.caption}</p>
              <p className="mt-2 text-brand-text">{script.hashtags.join(" ")}</p>
            </section>

            <CopyButton text={fullText(project)} label="คัดลอกทั้งสคริปต์" variant="secondary" />
          </aside>
        ) : null}
      </div>

      {script && project.status === "ready" ? <VoiceSection project={project} onProject={setData} /> : null}

      {project.research ? <ResearchSection research={project.research} /> : null}
    </Shell>
  );
}
