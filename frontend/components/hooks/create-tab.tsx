"use client";

import { ImagePlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, shrinkImage } from "@/lib/hooks/api";
import type { Profile, ProjectSummary } from "@/lib/hooks/types";
import { cn } from "@/lib/utils";
import { ErrorNote } from "./bits";

const MAX_IMAGES = 4;

export function CreateTab({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [duration, setDuration] = useState("30");
  const [images, setImages] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [past, setPast] = useState<ProjectSummary[]>([]);

  useEffect(() => {
    api.projects(profile.id).then(setPast).catch(() => undefined);
  }, [profile.id]);

  async function pick(files: FileList | File[] | null) {
    if (!files) return;
    setError(null);
    try {
      const room = MAX_IMAGES - images.length;
      const list = Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, room);
      const next = await Promise.all(list.map((f) => shrinkImage(f)));
      setImages((cur) => [...cur, ...next]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "อ่านรูปไม่ได้");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const project = await api.createProject(profile.id, { title: "", notes, productUrl, images, durationSec: Number(duration) });
      router.push(`/hooks/${profile.id}/scripts/${project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
      setBusy(false);
    }
  }

  const empty = !images.length && !notes.trim() && !productUrl.trim();

  return (
    <div className="flex flex-col gap-12">
      <form onSubmit={submit}>
        <div>
            <FieldGroup className="gap-8">
              <Field>
                <FieldLabel>รูปสินค้า</FieldLabel>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {images.map((src, n) => (
                    <div key={src.slice(-24) + n} className="relative aspect-square overflow-hidden rounded-2xl bg-secondary">
                      {/* biome-ignore lint/performance/noImgElement: local data URL preview */}
                      <img src={src} alt={`รูปสินค้า ${n + 1}`} className="size-full object-cover" />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label="เอารูปนี้ออก"
                        onClick={() => setImages((cur) => cur.filter((_, k) => k !== n))}
                        className="absolute top-2 right-2 bg-background/85 backdrop-blur"
                      >
                        <X />
                      </Button>
                    </div>
                  ))}
                  {images.length < MAX_IMAGES ? (
                    <label
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); void pick(e.dataTransfer.files); }}
                      className={cn(
                        "pressable flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-muted-foreground transition-colors focus-within:ring-[3px] focus-within:ring-ring/60 hover:bg-surface",
                        images.length === 0 && "col-span-2 aspect-auto min-h-40 sm:col-span-4",
                        dragging && "border-brand bg-brand-wash text-brand-text",
                      )}
                    >
                      <ImagePlus className="size-7" aria-hidden />
                      <span className="text-[0.9375rem]">{images.length === 0 ? "ลากรูปมาวาง หรือกดเลือก" : "เพิ่มรูป"}</span>
                      <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void pick(e.target.files); e.target.value = ""; }} />
                    </label>
                  ) : null}
                </div>
                <FieldDescription>ได้สูงสุด {MAX_IMAGES} รูป ถ่ายหลายมุมจะได้สคริปต์ที่ตรงขึ้น</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="notes">อยากบอกอะไรเพิ่มไหม</FieldLabel>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="ราคา ขายใคร จุดเด่นที่อยากเน้น"
                  className="resize-none rounded-2xl bg-surface text-base"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="product-url">ลิงก์หน้าสินค้า</FieldLabel>
                <Input id="product-url" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} inputMode="url" placeholder="https://" className="h-11 rounded-full bg-surface px-5 text-base" />
                <FieldDescription>มีลิงก์ ระบบจะอ่านรายละเอียดจริงแทนการเดา</FieldDescription>
              </Field>

              <Field>
                <FieldLabel>ความยาวคลิป</FieldLabel>
                <ToggleGroup type="single" variant="outline" value={duration} onValueChange={(v) => v && setDuration(v)} className="w-fit">
                  {["15", "30", "45", "60"].map((s) => (
                    <ToggleGroupItem key={s} value={s} className="h-11 min-w-16 px-5 text-base">{s} วิ</ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            </FieldGroup>

            {error ? <div className="mt-6"><ErrorNote>{error}</ErrorNote></div> : null}
            <Button type="submit" size="lg" className="mt-8" disabled={busy || empty}>
              {busy ? <Spinner /> : null} เขียนสคริปต์
            </Button>
        </div>
      </form>

      {past.length ? (
        <section aria-labelledby="past">
          <h2 id="past" className="text-xl font-semibold tracking-tight">ที่เคยทำ</h2>
          <ul className="mt-3 divide-y">
            {past.map((p) => (
              <li key={p.id}>
                <Link href={`/hooks/${profile.id}/scripts/${p.id}`} className="-mx-3 flex items-center gap-4 rounded-xl px-3 py-3 outline-none transition-colors hover:bg-surface focus-visible:ring-[3px] focus-visible:ring-ring/60">
                  {p.thumbnail ? (
                    // biome-ignore lint/performance/noImgElement: stored data URL thumbnail
                    <img src={p.thumbnail} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-[1.0625rem] font-medium">{p.productName ?? p.title}</span>
                    <span className="block text-[0.9375rem] text-muted-foreground">
                      {p.status === "running" ? "กำลังเขียน" : p.status === "error" ? "ต้องลองใหม่" : new Date(p.createdAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
