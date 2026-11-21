"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/hooks/api";
import type { Grade, Project } from "@/lib/hooks/types";
import { ErrorNote, GradeChip } from "./bits";

type Option = { text: string; grade: Grade; note: string };

function Options({ items, chosen, onPick }: { items: Option[]; chosen: string | null; onPick: (text: string) => void }) {
  if (!items.length) return <p className="py-6 text-muted-foreground">ไม่มีตัวเลือกในกลุ่มนี้</p>;
  return (
    <ul className="divide-y border-y">
      {items.map((h) => (
        <li key={h.text} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 py-4">
          <GradeChip grade={h.grade} className="mt-0.5" />
          <div className="min-w-0">
            <p className="text-[1.125rem] leading-snug font-medium whitespace-pre-line">{h.text}</p>
            <p className="mt-1 text-[0.9375rem] text-muted-foreground">{h.note}</p>
          </div>
          <div className="col-start-2">
            {chosen === h.text ? (
              <span className="text-[0.9375rem] font-medium text-brand-text">กำลังใช้อยู่</span>
            ) : (
              <Button type="button" variant="secondary" size="sm" onClick={() => onPick(h.text)}>ใช้อันนี้</Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HookSheet({ project, disabled, onChoose, onProject }: { project: Project; disabled: boolean; onChoose: (hook: string) => Promise<void>; onProject: (p: Project) => void }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState("");
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hooks = project.hooks;
  if (!hooks) return null;

  async function pick(text: string) {
    setOpen(false);
    await onChoose(text);
  }

  async function grade() {
    setGrading(true);
    setError(null);
    try {
      onProject(await api.gradeHook(project.id, mine));
    } catch (e) {
      setError(e instanceof Error ? e.message : "ให้คะแนนไม่สำเร็จ");
    } finally {
      setGrading(false);
    }
  }

  const review = project.review?.result;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="secondary" disabled={disabled}>เปลี่ยนฮุก</Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-2xl">เลือกฮุก</SheetTitle>
          <SheetDescription>เลือกแล้วสคริปต์จะถูกเขียนใหม่รอบฮุกนั้น</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="format" className="gap-4 px-6 pb-8">
          <TabsList className="w-full">
            <TabsTrigger value="format">จากสไตล์คุณ</TabsTrigger>
            <TabsTrigger value="original">เขียนใหม่</TabsTrigger>
            <TabsTrigger value="mine">ของคุณเอง</TabsTrigger>
          </TabsList>

          <TabsContent value="format">
            <Options items={hooks.formatMatched.map((h) => ({ text: h.text, grade: h.grade, note: h.note }))} chosen={project.chosenHook} onPick={pick} />
            {hooks.skippedFormats.length ? (
              <p className="mt-4 text-[0.9375rem] text-muted-foreground">
                ตัดออกเพราะไม่เข้ากับสินค้านี้: {hooks.skippedFormats.map((s) => s.formatLabel).join(" ")}
              </p>
            ) : null}
          </TabsContent>

          <TabsContent value="original">
            <Options items={hooks.original} chosen={project.chosenHook} onPick={pick} />
          </TabsContent>

          <TabsContent value="mine" className="grid gap-5">
            <div>
              <label htmlFor="mine" className="sr-only">ฮุกของคุณ</label>
              <Textarea id="mine" value={mine} onChange={(e) => setMine(e.target.value)} rows={3} maxLength={600} placeholder="พิมพ์ฮุกที่คิดไว้" className="resize-none rounded-2xl bg-surface text-base" />
              <Button type="button" className="mt-3" onClick={grade} disabled={mine.trim().length < 2 || grading}>
                {grading ? <Spinner /> : null} ให้คะแนน
              </Button>
            </div>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            {review ? (
              <div className="grid gap-5">
                <div className="flex items-start gap-3">
                  <GradeChip grade={review.overall} className="mt-0.5" />
                  <p className="text-[1.0625rem] leading-snug">{review.summary}</p>
                </div>
                <ul className="divide-y border-y">
                  {review.lines.map((l) => (
                    <li key={l.line} className="grid grid-cols-[auto_1fr] gap-x-3 py-3">
                      <GradeChip grade={l.grade} className="mt-0.5" />
                      <div>
                        <p className="font-medium whitespace-pre-line">{l.line}</p>
                        <p className="text-[0.9375rem] text-muted-foreground">{l.comment}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div>
                  <h3 className="mb-1 font-semibold">เขียนใหม่ให้ 3 แบบ</h3>
                  <Options items={review.rewrites.map((r) => ({ text: r.text, grade: r.grade, note: r.whyStronger }))} chosen={project.chosenHook} onPick={pick} />
                </div>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
