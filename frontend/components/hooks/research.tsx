"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Project } from "@/lib/hooks/types";
import { host } from "./bits";

type Research = NonNullable<Project["research"]>;

function Rows({ items }: { items: string[] }) {
  return (
    <ul className="divide-y border-y">
      {items.map((t) => <li key={t} className="py-3.5 text-[1.0625rem] leading-snug">{t}</li>)}
    </ul>
  );
}

function SourceLabel({ fact }: { fact: Research["facts"][number] }) {
  if (fact.source === "user") return <span>จากคุณ</span>;
  if (fact.source === "image") return <span>จากรูป</span>;
  if (!fact.sourceUrl) return <span>จากเว็บ</span>;
  return (
    <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
      {host(fact.sourceUrl)}
    </a>
  );
}

export function ResearchSection({ research }: { research: Research }) {
  const sites = [...new Map(research.sources.map((s) => [host(s.url), s.url])).entries()].slice(0, 8);
  const mind = [...research.painPoints, ...research.objections];

  return (
    <section aria-labelledby="research" className="mt-20">
      <h2 id="research" className="text-2xl font-semibold tracking-tight">ข้อมูลที่ค้นมา</h2>
      {sites.length ? (
        <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.9375rem] text-muted-foreground">
          {sites.map(([name, url]) => (
            <a key={name} href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">{name}</a>
          ))}
        </p>
      ) : null}

      <Tabs defaultValue="facts" className="mt-6 gap-5">
        <TabsList>
          <TabsTrigger value="facts">ข้อเท็จจริง {research.facts.length}</TabsTrigger>
          <TabsTrigger value="selling">จุดขาย</TabsTrigger>
          <TabsTrigger value="mind">ลูกค้าคิดอะไร</TabsTrigger>
          {research.claimsToVerify.length ? <TabsTrigger value="open">ยังไม่ยืนยัน</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="facts">
          <ul className="divide-y border-y">
            {research.facts.map((f) => (
              <li key={f.claim} className="flex items-baseline justify-between gap-6 py-3.5">
                <span className="text-[1.0625rem] leading-snug">{f.claim}</span>
                <span className="shrink-0 text-[0.9375rem] text-muted-foreground"><SourceLabel fact={f} /></span>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="selling"><Rows items={research.sellingPoints} /></TabsContent>
        <TabsContent value="mind"><Rows items={mind} /></TabsContent>
        <TabsContent value="open"><Rows items={research.claimsToVerify} /></TabsContent>
      </Tabs>

      {research.warnings.map((w) => <p key={w} className="mt-4 text-[0.9375rem] text-muted-foreground">{w}</p>)}
    </section>
  );
}
