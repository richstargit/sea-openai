"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/lib/hooks/api";
import type { Capabilities, ProfileSummary } from "@/lib/hooks/types";
import { ErrorNote, Meta, PageTitle, Reveal, Shell } from "./bits";

const STATUS: Record<string, string | null> = { draft: "ร่าง", running: "กำลังวิเคราะห์", ready: null, error: "ต้องรันใหม่" };

function problems(caps: Capabilities | null): string[] {
  if (!caps) return [];
  const list: string[] = [];
  if (!caps.ai) list.push("ยังไม่ได้ตั้ง OPENAI_API_KEY");
  if (!caps.agentReach) list.push("ไม่พบ Agent-Reach");
  if (!caps.ytDlp) list.push("ไม่พบ yt-dlp");
  if (!caps.ffmpeg) list.push("ไม่พบ ffmpeg");
  return list;
}

export function ProfileList() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<ProfileSummary[] | null>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.profiles().then(setProfiles).catch((e: Error) => { setError(e.message); setProfiles([]); });
    api.capabilities().then(setCaps).catch(() => undefined);
  }, []);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const profile = await api.createProfile(name.trim(), "th");
      router.push(`/hooks/${profile.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
      setBusy(false);
    }
  }

  const issues = problems(caps);

  return (
    <Shell>
      <PageTitle title="พูดแบบที่คุณชอบ ให้ทุกสินค้า" />
      <p className="mt-4 max-w-[32rem] text-[1.1875rem] leading-relaxed text-muted-foreground">
        วางลิงก์คลิปที่ชอบ ระบบจับสไตล์การพูดแล้วเขียนสคริปต์สินค้าใหม่ให้
      </p>

      {caps?.mockAi ? <Badge variant="wash" className="mt-5">โหมดเดโม</Badge> : null}
      {issues.length ? <div className="mt-5"><ErrorNote>{issues.join(" และ ")}</ErrorNote></div> : null}

      <form onSubmit={create} className="mt-10 flex flex-col gap-3 sm:flex-row">
        <label htmlFor="profile-name" className="sr-only">ชื่อโปรไฟล์</label>
        <Input
          id="profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          placeholder="ชื่อโปรไฟล์ เช่น รีวิวของใช้ในบ้าน"
          className="h-12 flex-1 rounded-full bg-surface px-5 text-base"
        />
        <Button type="submit" size="lg" disabled={!name.trim() || busy}>
          {busy ? <Spinner /> : null} สร้างโปรไฟล์
        </Button>
      </form>
      {error ? <div className="mt-4"><ErrorNote>{error}</ErrorNote></div> : null}

      <section className="mt-16" aria-labelledby="mine">
        <h2 id="mine" className="text-xl font-semibold tracking-tight">โปรไฟล์ของคุณ</h2>
        {profiles === null ? (
          <div className="mt-4 grid gap-1">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        ) : profiles.length === 0 ? (
          <p className="mt-4 text-muted-foreground">ยังไม่มีโปรไฟล์ ตั้งชื่อด้านบนเพื่อเริ่ม</p>
        ) : (
          <Reveal>
            <ul className="mt-3 divide-y">
              {profiles.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/hooks/${p.id}`}
                    className="-mx-3 flex items-center justify-between gap-4 rounded-xl px-3 py-4 outline-none transition-colors hover:bg-surface focus-visible:ring-[3px] focus-visible:ring-ring/60"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[1.1875rem] font-medium">{p.name}</span>
                      <Meta className="mt-0.5">
                        <>{p.doneCount} จาก {p.sourceCount} คลิป</>
                        <>{new Date(p.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}</>
                      </Meta>
                    </span>
                    {STATUS[p.status] ? <Badge variant={p.status === "error" ? "destructive" : "wash"}>{STATUS[p.status]}</Badge> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </section>
    </Shell>
  );
}
