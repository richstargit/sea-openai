"use client";

import { Download, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { api, takeAudioUrl } from "@/lib/hooks/api";
import type { Project, VoiceOptions, VoiceTake } from "@/lib/hooks/types";
import { cn } from "@/lib/utils";
import { clock, ErrorNote } from "./bits";

const PARTS: { key: "intelligibility" | "pacing" | "style" | "technical"; label: string }[] = [
  { key: "intelligibility", label: "ฟังชัด" },
  { key: "pacing", label: "จังหวะ" },
  { key: "style", label: "ตรงสไตล์" },
  { key: "technical", label: "คุณภาพไฟล์" },
];

function Rating({ value, onRate }: { value: number | null; onRate: (stars: number) => void }) {
  return (
    <div role="group" aria-label="ให้คะแนนของคุณ" className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`ให้ ${n} ดาว`}
          aria-pressed={value === n}
          onClick={() => onRate(n)}
          className="pressable grid size-9 place-items-center rounded-full outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring/60"
        >
          <Star className={cn("size-5", value !== null && n <= value ? "fill-brand text-brand" : "text-muted-foreground")} />
        </button>
      ))}
    </div>
  );
}

function TakeRow({ take, projectId, onRate }: { take: VoiceTake; projectId: string; onRate: (stars: number) => void }) {
  const scores = take.scores;
  return (
    <li className="py-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[1.1875rem] font-medium">
            {take.styleName}
            {take.recommended ? <Badge variant="default">แนะนำ</Badge> : null}
          </p>
          {take.durationSec != null ? <p className="mt-0.5 text-[0.9375rem] text-muted-foreground">ยาว {clock(take.durationSec)}</p> : null}
        </div>
        {scores ? (
          <p className="shrink-0 text-right" aria-label={`คะแนนรวม ${scores.total} จาก 100`}>
            <span className="text-[2.5rem] leading-none font-semibold tracking-tight tabular-nums">{scores.total}</span>
            <span className="ml-1 text-[0.9375rem] text-muted-foreground">จาก 100</span>
          </p>
        ) : null}
      </div>

      {take.status === "pending" || take.status === "running" ? (
        <p className="mt-4 flex items-center gap-2 text-muted-foreground"><Spinner /> {take.status === "pending" ? "รอคิว" : "กำลังสร้างและให้คะแนน"}</p>
      ) : null}
      {take.status === "error" ? <div className="mt-4"><ErrorNote>{take.error ?? "สร้างไม่สำเร็จ"}</ErrorNote></div> : null}

      {take.status === "done" ? (
        <>
          {/* biome-ignore lint/a11y/useMediaCaption: synthetic voiceover, the transcript is shown below */}
          <audio controls preload="none" src={takeAudioUrl(projectId, take.id)} className="mt-4 w-full" />

          {scores ? (
            <>
              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {PARTS.map(({ key, label }) => {
                  const value = scores[key];
                  return (
                    <div key={key}>
                      <dt className="text-[0.9375rem] text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 text-xl font-medium tabular-nums">{value === null ? "ไม่ได้ประเมิน" : value}</dd>
                      <div className="mt-1.5 h-1 rounded-full bg-secondary" aria-hidden>
                        <div className="h-1 rounded-full bg-foreground" style={{ width: `${value ?? 0}%` }} />
                      </div>
                    </div>
                  );
                })}
              </dl>
              {scores.reason ? <p className="mt-4 text-[1.0625rem] leading-snug">{scores.reason}</p> : null}
            </>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Rating value={take.userRating} onRate={onRate} />
            <Button asChild variant="secondary" size="sm">
              <a href={takeAudioUrl(projectId, take.id, true)} download>
                <Download /> ดาวน์โหลด
              </a>
            </Button>
          </div>

          {take.transcript ? (
            <Accordion type="single" collapsible className="mt-2 border-t">
              <AccordionItem value="t" className="border-b-0">
                <AccordionTrigger className="py-3 text-[0.9375rem] font-normal text-muted-foreground hover:no-underline">ดูข้อความที่ระบบได้ยิน</AccordionTrigger>
                <AccordionContent className="pb-2 text-[1.0625rem] leading-relaxed whitespace-pre-line">{take.transcript}</AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function VoiceSection({ project, onProject }: { project: Project; onProject: (p: Project) => void }) {
  const [options, setOptions] = useState<VoiceOptions | null>(null);
  const [language, setLanguage] = useState("en");
  const [model, setModel] = useState("gpt-4o-mini-tts");
  const [voice, setVoice] = useState("marin");
  const [styles, setStyles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const voiceState = project.voice;
  const running = voiceState?.status === "running";

  useEffect(() => {
    api.voiceOptions().then((o) => {
      setOptions(o);
      const prev = project.voice?.settings;
      setLanguage(prev?.language ?? o.defaults.language);
      setModel(prev?.model ?? o.defaults.model);
      setVoice(prev?.voice ?? o.defaults.voice);
      setStyles(prev?.styleIds ?? o.defaults.styles);
    }).catch((e: Error) => setError(e.message));
    // Settings only seed from the first load of the project.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!options) return error ? <ErrorNote>{error}</ErrorNote> : null;

  const modelInfo = options.models.find((m) => m.id === model) ?? options.models[0];
  if (!modelInfo) return null;

  function pickModel(id: string) {
    setModel(id);
    const next = options?.models.find((m) => m.id === id);
    if (next && !next.voices.some((v) => v.id === voice)) setVoice(next.voices[0]?.id ?? "alloy");
  }

  function toggleStyle(id: string, on: boolean) {
    setStyles((cur) => (on ? [...cur, id].slice(0, options?.maxStyles ?? 6) : cur.filter((s) => s !== id)));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const next = await api.createVoice(project.id, { language, model, voice, styles });
      onProject({ ...project, voice: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างเสียงไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function rate(takeId: string, stars: number) {
    try {
      onProject(await api.rateTake(project.id, takeId, stars));
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกคะแนนไม่สำเร็จ");
    }
  }

  const translated = language !== project.language;

  return (
    <section aria-labelledby="voice" className="mt-20">
      <h2 id="voice" className="text-2xl font-semibold tracking-tight">เสียงพากย์</h2>
      <p className="mt-2 max-w-[34rem] text-[1.0625rem] text-muted-foreground">อ่านสคริปต์นี้ในหลายสไตล์ แล้วฟังเทียบกัน</p>

      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="voice-language">ภาษา</FieldLabel>
          <Select value={language} onValueChange={setLanguage} disabled={running}>
            <SelectTrigger id="voice-language" className="h-11 w-full rounded-full bg-surface px-4 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.languages.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}{l.code === options.defaults.language ? " ค่าเริ่มต้น" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="voice-model">โมเดลเสียง</FieldLabel>
          <Select value={model} onValueChange={pickModel} disabled={running}>
            <SelectTrigger id="voice-model" className="h-11 w-full rounded-full bg-surface px-4 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.models.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}{m.recommended ? " ดีที่สุด" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="voice-voice">เสียง</FieldLabel>
          <Select value={voice} onValueChange={setVoice} disabled={running}>
            <SelectTrigger id="voice-voice" className="h-11 w-full rounded-full bg-surface px-4 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {modelInfo.voices.map((v) => (
                <SelectItem key={v.id} value={v.id}>{v.id}{v.recommended ? " แนะนำ" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="mt-3 text-[0.9375rem] text-muted-foreground">
        {modelInfo.note}
        {translated ? " ระบบจะแปลสคริปต์ให้ก่อนอ่าน" : ""}
      </p>

      <fieldset className="mt-8" disabled={running}>
        <legend className="font-semibold">สไตล์การพูด</legend>
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {options.styles.map((s) => (
            <div key={s.id} className="flex items-start gap-3">
              <Checkbox id={`style-${s.id}`} checked={styles.includes(s.id)} onCheckedChange={(v) => toggleStyle(s.id, v === true)} className="mt-1" />
              <label htmlFor={`style-${s.id}`} className="cursor-pointer">
                <span className="block text-[1.0625rem] font-medium">{s.label}</span>
                <span className="block text-[0.9375rem] text-muted-foreground">{s.summary}</span>
              </label>
            </div>
          ))}
        </div>
        {!modelInfo.supportsInstructions ? (
          <p className="mt-4 text-[0.9375rem] text-muted-foreground">รุ่นนี้ปรับสไตล์ได้แค่ความเร็ว เสียงของแต่ละสไตล์จะต่างกันน้อยกว่า</p>
        ) : null}
      </fieldset>

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button type="button" size="lg" onClick={generate} disabled={busy || running || styles.length === 0}>
          {busy || running ? <Spinner /> : null} สร้างเสียง {styles.length} สไตล์
        </Button>
        <p className="text-[0.9375rem] text-muted-foreground">เสียงทุกไฟล์สร้างด้วย AI ไม่ใช่เสียงมนุษย์</p>
      </div>

      <Alert className="mt-6 max-w-2xl bg-surface">
        <AlertDescription>{options.deprecation.message}</AlertDescription>
      </Alert>

      {error ? <div className="mt-6"><ErrorNote>{error}</ErrorNote></div> : null}
      {voiceState?.status === "error" && voiceState.error ? <div className="mt-6"><ErrorNote>{voiceState.error}</ErrorNote></div> : null}
      {running && voiceState?.step ? <p aria-live="polite" className="mt-6 text-muted-foreground">{voiceState.step}</p> : null}

      {voiceState && voiceState.takes.length ? (
        <div className="mt-10">
          {voiceState.mock ? <Badge variant="wash" className="mb-4">โหมดเดโม เสียงและคะแนนเป็นข้อมูลตัวอย่าง</Badge> : null}
          <ul className="divide-y border-y">
            {voiceState.takes.map((t) => (
              <TakeRow key={t.id} take={t} projectId={project.id} onRate={(stars) => void rate(t.id, stars)} />
            ))}
          </ul>
          <p className="mt-4 max-w-[38rem] text-[0.9375rem] text-muted-foreground">
            คะแนนใช้เทียบสไตล์ของสคริปต์เดียวกัน ไม่ใช่คะแนนคุณภาพเสียงแบบสัมบูรณ์ ฟังจริงแล้วให้ดาวตามที่คุณชอบ
          </p>
        </div>
      ) : null}
    </section>
  );
}
