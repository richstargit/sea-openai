"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Pattern, Profile } from "@/lib/hooks/types";
import { CopyButton, Meta, Reveal } from "./bits";

function PatternList({ items }: { items: Pattern[] }) {
  return (
    <ul className="grid gap-4">
      {items.map((p) => (
        <li key={p.name}>
          <p className="font-medium">{p.name}</p>
          <p className="text-[0.9375rem] text-muted-foreground">{p.description}</p>
        </li>
      ))}
    </ul>
  );
}

export function StyleTab({ profile, onCreate }: { profile: Profile; onCreate: () => void }) {
  const i = profile.insights;
  if (!i) return null;
  const maxSec = Math.max(...i.structureTemplate.map((b) => b.typicalSec), 1);
  const groups = [
    { key: "psychology", title: "จิตวิทยาที่ใช้", items: i.patterns.psychology },
    { key: "words", title: "คำที่ใช้บ่อย", items: i.patterns.triggerWords },
    { key: "grammar", title: "โครงประโยค", items: i.patterns.grammar },
    { key: "pace", title: "จังหวะและภาพ", items: i.patterns.pacingAndVisual },
  ].filter((g) => g.items.length);

  return (
    <Reveal className="flex flex-col gap-14">
      <section>
        <p className="max-w-[38rem] text-[1.5rem] leading-snug font-medium text-balance sm:text-[1.875rem]">{i.styleSummary}</p>
        <Button type="button" size="lg" className="mt-7" onClick={onCreate}>เขียนสคริปต์สินค้า</Button>
      </section>

      <section aria-labelledby="voice">
        <h2 id="voice" className="text-xl font-semibold tracking-tight">น้ำเสียง</h2>
        <Meta className="mt-2 text-base">
          <>{i.voice.tone}</>
          <>{i.voice.persona}</>
          <>{i.voice.sentenceStyle}</>
        </Meta>
        <div className="mt-4 flex flex-wrap gap-2">
          {i.voice.vocabulary.map((w) => <Badge key={w} variant="wash">{w}</Badge>)}
          {i.voice.avoid.map((w) => <Badge key={w} variant="outline" className="line-through decoration-muted-foreground/60">{w}</Badge>)}
        </div>
      </section>

      <section aria-labelledby="formats">
        <h2 id="formats" className="text-xl font-semibold tracking-tight">รูปแบบฮุก {i.hookFormats.length} แบบ</h2>
        <ol className="mt-4 divide-y border-y">
          {i.hookFormats.map((f, n) => (
            <li key={`${f.label}-${n}`} className="grid gap-x-8 gap-y-3 py-6 sm:grid-cols-[1fr_16rem]">
              <div>
                <p className="text-[0.9375rem] text-muted-foreground">{f.label}</p>
                <p className="mt-1 text-[1.375rem] leading-snug font-medium whitespace-pre-line">{f.original}</p>
              </div>
              <p className="self-start rounded-xl bg-surface px-4 py-3 text-[0.9375rem] whitespace-pre-line text-muted-foreground">{f.formula}</p>
            </li>
          ))}
        </ol>
      </section>

      <Accordion type="multiple" className="border-t">
        {groups.length ? (
          <AccordionItem value="patterns">
            <AccordionTrigger className="py-5 text-lg font-semibold hover:no-underline">รูปแบบที่ระบบจับได้</AccordionTrigger>
            <AccordionContent className="grid gap-8 pb-6 sm:grid-cols-2">
              {groups.map((g) => (
                <div key={g.key}>
                  <h3 className="mb-3 font-medium text-brand-text">{g.title}</h3>
                  <PatternList items={g.items} />
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ) : null}

        <AccordionItem value="structure">
          <AccordionTrigger className="py-5 text-lg font-semibold hover:no-underline">โครงคลิป</AccordionTrigger>
          <AccordionContent className="pb-6">
            <ol className="grid gap-4">
              {i.structureTemplate.map((b) => (
                <li key={b.name} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-3">
                  <span className="font-medium">{b.name}</span>
                  <div>
                    <div className="h-1.5 rounded-full bg-secondary"><div className="h-1.5 rounded-full bg-foreground" style={{ width: `${(b.typicalSec / maxSec) * 100}%` }} /></div>
                    <p className="mt-1.5 text-[0.9375rem] text-muted-foreground">{b.purpose}</p>
                  </div>
                  <span className="text-right text-[0.9375rem] text-muted-foreground tabular-nums">{b.typicalSec} วิ</span>
                </li>
              ))}
            </ol>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="rubric">
          <AccordionTrigger className="py-5 text-lg font-semibold hover:no-underline">เกณฑ์ให้คะแนนฮุก {profile.rubric.length} ข้อ</AccordionTrigger>
          <AccordionContent className="pb-6">
            <ul className="grid gap-5 sm:grid-cols-2">
              {profile.rubric.map((p) => (
                <li key={p.name}>
                  <p className="flex flex-wrap items-center gap-2 font-medium">{p.name}{p.source === "profile" ? <Badge variant="wash">เฉพาะโปรไฟล์นี้</Badge> : null}</p>
                  <p className="text-[0.9375rem] text-muted-foreground">{p.description}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5"><CopyButton text={profile.rubric.map((p) => `${p.name}: ${p.description}`).join("\n")} label="คัดลอกเกณฑ์" /></div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Reveal>
  );
}
