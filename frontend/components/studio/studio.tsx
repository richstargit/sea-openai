"use client";

import { useLanguage } from "@/components/language-provider";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Camera, Check, Download, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Phone } from "@/components/phone";
import { ClipScene } from "@/components/clip-scene";
import { ProductArt } from "@/components/product-art";
import { productList, products, type ProductKind } from "@/lib/demo-data";
import { fade, spring } from "@/lib/spring";
import { cn } from "@/lib/utils";

type Step = "photos" | "details" | "making" | "done";
type Photo = { id: number; url: string | null }; // null = illustrated sample

const MAX = 5;
const MIN = 3;
const steps: { id: Step; label: string }[] = [
  { id: "photos", label: "รูป" },
  { id: "details", label: "ข้อมูล" },
  { id: "making", label: "สร้าง" },
  { id: "done", label: "ผลลัพธ์" },
];
const stages = [
  "เข้าใจสินค้าจากรูป",
  "สร้างโมเดล 3D",
  "เขียนบทโฆษณา",
  "เขียนฉาก motion",
  "ตรวจภาพก่อน render",
];
const STAGE_MS = 1300;

export function Studio() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [kind, setKind] = useState<ProductKind>("food");
  const [price, setPrice] = useState("89");
  const [promo, setPromo] = useState("");
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const idRef = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    },
    [],
  );

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const room = MAX - photos.length;
    const added = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, room)
      .map((f) => {
        const url = URL.createObjectURL(f);
        urlsRef.current.push(url);
        return { id: idRef.current++, url };
      });
    setPhotos((p) => [...p, ...added]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const useSamples = () =>
    setPhotos(Array.from({ length: 4 }, () => ({ id: idRef.current++, url: null })));

  const start = () => {
    setStage(0);
    setElapsed(0);
    startedAt.current = performance.now();
    setStep("making");
  };

  // Simulated pipeline. Front-end prototype only: nothing is sent anywhere.
  useEffect(() => {
    if (step !== "making") return;
    const tick = setInterval(() => setElapsed((performance.now() - startedAt.current) / 1000), 100);
    const advance = setInterval(() => {
      setStage((s) => {
        if (s + 1 >= stages.length) {
          clearInterval(advance);
          setElapsed((performance.now() - startedAt.current) / 1000);
          setTimeout(() => setStep("done"), 500);
          return stages.length;
        }
        return s + 1;
      });
    }, STAGE_MS);
    return () => {
      clearInterval(tick);
      clearInterval(advance);
    };
  }, [step]);

  const reset = () => {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    urlsRef.current = [];
    setPhotos([]);
    setPromo("");
    setStep("photos");
  };

  const theme = useMemo(
    () => ({ ...products[kind], price: `฿${price.replace(/[^\d.,]/g, "") || "0"}` }),
    [kind, price],
  );
  const cover = photos.find((p) => p.url)?.url ?? undefined;
  const versions = [
      { id: "A", angle: "ราคานำ", line: promo.trim() ? `${promo.trim()} ${t("วันนี้วันเดียว")}` : `${theme.price} ${t("วันนี้วันเดียว")}` },
      { id: "B", angle: "ปัญหานำ", line: theme.hook },
      { id: "C", angle: "เรื่องเล่า", line: theme.selling },
    ];

  const enter = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
    : {
        initial: { opacity: 0, y: 16 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -8 },
        transition: spring,
      };
  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto w-full max-w-[520px] px-4 pt-8 pb-24 sm:px-6 sm:pt-14">
      {/* where am I */}
      <ol className="flex items-center gap-2" aria-label={t("ขั้นตอน")}>
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={i === stepIndex ? "step" : undefined}
            className="flex flex-1 flex-col gap-2"
          >
            <span
              className={cn(
                "h-1 rounded-full transition-colors duration-300",
                i <= stepIndex ? "bg-brand" : "bg-foreground/12",
              )}
            />
            <span className={cn("t-small", i === stepIndex ? "font-semibold" : "text-muted-foreground")}>
              {t(s.label)}
            </span>
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        {step === "photos" && (
          <motion.section key="photos" {...enter} className="mt-10">
            <h1 className="t-h2 !text-[2.25rem] sm:!text-[2.75rem]">{t("ถ่ายรูปสินค้า 3–5 มุม")}</h1>
            <p className="mt-3 text-muted-foreground">
              {t(" ด้านหน้า ด้านข้าง ด้านหลัง และใกล้ ๆ ฉลาก แสงธรรมชาติใกล้หน้าต่างช่วยได้มาก ")}</p>

            <ul className="mt-8 grid grid-cols-3 gap-3">
              {Array.from({ length: MAX }).map((_, i) => {
                const p = photos[i];
                return (
                  <li key={i} className="relative aspect-square">
                    {t(p ? (
                      <>
                        <div className="size-full overflow-hidden rounded-2xl bg-surface">
                          {p.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.url} alt={`${t("รูปที่")} ${i + 1}`} className="size-full object-cover" />
                          ) : (
                            <ProductArt kind="food" title={`${t("รูปตัวอย่างที่")} ${i + 1}`} className="size-full scale-110" />
                          )}
                        </div>
                        <button
                          type="button"
                          aria-label={`${t("ลบรูปที่")} ${i + 1}`}
                          onClick={() => setPhotos((ps) => ps.filter((x) => x.id !== p.id))}
                          className="pressable absolute -top-2 -right-2 grid size-8 place-items-center rounded-full bg-foreground text-background shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
                        >
                          <X className="size-4" />
                        </button>
                      </>
                    ) : i === photos.length ? (
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="pressable grid size-full place-items-center rounded-2xl border-2 border-dashed border-foreground/25 text-muted-foreground transition-colors hover:border-brand-text hover:text-brand-text focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
                        aria-label={t("เพิ่มรูป")}
                      >
                        <Plus className="size-7" />
                      </button>
                    ) : (
                      <div className="size-full rounded-2xl bg-surface" aria-hidden />
                    ))}
                  </li>
                );
              })}
            </ul>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              className="sr-only"
              onChange={(e) => addFiles(e.target.files)}
              tabIndex={-1}
              aria-hidden
            />

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={photos.length >= MAX}>
                <Camera /> {t(" ถ่าย / เลือกรูป ")}</Button>
              <Button variant="ghost" onClick={useSamples}>
                <ImagePlus /> {t(" ใช้รูปตัวอย่าง ")}</Button>
            </div>
            <p className="t-small mt-3 text-muted-foreground">
              {t(" รูปอยู่ในเบราว์เซอร์นี้เท่านั้น ยังไม่ถูกอัปโหลดไปไหน ")}</p>

            <div className="mt-10 flex items-center justify-between gap-4">
              <span className="t-small text-muted-foreground tabular-nums">
                {t(photos.length)}/{t(MAX)} {t(" รูป ")}{photos.length < MIN && `(${t("อย่างน้อย")} ${MIN})`}
              </span>
              <Button size="lg" disabled={photos.length < MIN} onClick={() => setStep("details")}>
                {t(" ถัดไป ")}</Button>
            </div>
          </motion.section>
        )}

        {step === "details" && (
          <motion.section key="details" {...enter} className="mt-10">
            <h1 className="t-h2 !text-[2.25rem] sm:!text-[2.75rem]">{t("ขอข้อมูลอีกนิดเดียว")}</h1>
            <p className="mt-3 text-muted-foreground">
              {t(" ระบบอ่านประเภท สี และวัสดุจากรูปได้เอง แต่ราคาและโปรโมชันต้องให้คุณบอก ")}</p>

            <div className="mt-8">
              <p className="mb-2 text-[0.9375rem] font-semibold">{t("ประเภทสินค้า")}</p>
              <Tabs value={kind} onValueChange={(v) => setKind(v as ProductKind)}>
                <TabsList className="w-full" aria-label={t("ประเภทสินค้า")}>
                  {productList.map((p) => (
                    <TabsTrigger key={p.kind} value={p.kind} className="px-2 text-[0.875rem]">
                      {t(p.tab)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value={kind} className="mt-0" />
              </Tabs>
              <p className="t-small mt-2 text-muted-foreground">
                {t(" เดโมนี้ให้เลือกเอง เวอร์ชันจริงจะเดาจากรูปให้ ")}</p>
            </div>

            <div className="mt-8 grid gap-6">
              <div>
                <label htmlFor="price" className="mb-2 block text-[0.9375rem] font-semibold">
                  {t(" ราคา (บาท) ")}</label>
                <Input
                  id="price"
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="h-14 rounded-2xl bg-secondary px-5 text-[1.25rem] md:text-[1.25rem] border-transparent tabular-nums"
                />
              </div>
              <div>
                <label htmlFor="promo" className="mb-2 block text-[0.9375rem] font-semibold">
                  {t(" โปรโมชัน ")}<span className="font-normal text-muted-foreground">{t("(ถ้ามี)")}</span>
                </label>
                <Input
                  id="promo"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder={t("เช่น ซื้อ 2 ขวด ฿159")}
                  className="h-14 rounded-2xl bg-secondary px-5 text-[1.0625rem] md:text-[1.0625rem] border-transparent"
                />
              </div>
            </div>

            <div className="mt-10 flex items-center justify-between gap-4">
              <Button variant="ghost" onClick={() => setStep("photos")}>
                {t(" ย้อนกลับ ")}</Button>
              <Button size="lg" onClick={start} disabled={!price.trim()}>
                {t(" สร้างคลิป ")}</Button>
            </div>
          </motion.section>
        )}

        {step === "making" && (
          <motion.section key="making" {...enter} className="mt-10" aria-live="polite">
            <h1 className="t-h2 !text-[2.25rem] sm:!text-[2.75rem]">{t("กำลังทำคลิปให้คุณ")}</h1>
            <p className="mt-3 text-muted-foreground">
              {t(" เดโมนี้จำลองขั้นตอน ยังไม่ได้เชื่อมระบบสร้างวิดีโอจริง ")}</p>

            <Progress
              value={Math.min(100, (stage / stages.length) * 100)}
              className="mt-8 h-2 [&>div]:bg-brand bg-foreground/12"
              aria-label={t("ความคืบหน้า")}
            />

            <ol className="mt-8 flex flex-col">
              {stages.map((s, i) => {
                const state = i < stage ? "done" : i === stage ? "now" : "wait";
                return (
                  <li
                    key={s}
                    className={cn(
                      "flex min-h-14 items-center gap-4 border-b border-border last:border-0",
                      state === "wait" && "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full",
                        state === "done" && "bg-brand text-brand-ink",
                        state === "now" && "border-2 border-brand",
                        state === "wait" && "border border-foreground/20",
                      )}
                      aria-hidden
                    >
                      {state === "done" && <Check className="size-4" strokeWidth={3} />}
                      {state === "now" && (
                        <span className="size-2.5 animate-pulse rounded-full bg-brand" />
                      )}
                    </span>
                    <span className={cn("text-[1.0625rem]", state === "now" && "font-semibold")}>
                      {t(s)}
                    </span>
                  </li>
                );
              })}
            </ol>
            <p className="t-small mt-6 tabular-nums text-muted-foreground">
              {t(" จับเวลา ")}{elapsed.toFixed(1)} {t(" วินาที ")}</p>
          </motion.section>
        )}

        {step === "done" && (
          <motion.section key="done" {...enter} className="mt-10">
            <h1 className="t-h2 !text-[2.25rem] sm:!text-[2.75rem]">{t("คลิปพร้อมแล้ว")}</h1>
            <p className="mt-3 text-muted-foreground">
              {t(" สามเวอร์ชันเปิดต่างกัน เลือกอันที่ชอบหรือโพสต์ทดลองทั้งหมด ")}</p>

            <Tabs defaultValue="A" className="mt-8">
              <TabsList className="w-full" aria-label={t("เวอร์ชันของคลิป")}>
                {versions.map((v) => (
                  <TabsTrigger key={v.id} value={v.id}>
                    {t(" เวอร์ชัน ")}{t(v.id)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {versions.map((v) => (
                <TabsContent key={v.id} value={v.id} className="mt-8">
                  <div className="mx-auto w-[min(300px,76vw)]">
                    <Phone label={t("คลิปเวอร์ชัน ") + (v.id) + ": " + (v.line)}>
                      <ClipScene product={theme} hook={t(v.line)} caption={t(theme.selling)} image={cover} />
                    </Phone>
                  </div>
                  <p className="mt-6 text-center">
                    <Badge variant="wash">{t(v.angle)}</Badge>
                  </p>
                </TabsContent>
              ))}
            </Tabs>

            <dl className="mt-8 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-surface p-4">
                <dt className="t-small text-muted-foreground">{t("เวลาในเดโมนี้")}</dt>
                <dd className="mt-1 text-[1.5rem] font-semibold tabular-nums">{elapsed.toFixed(1)} {t(" วิ")}</dd>
              </div>
              <div className="rounded-2xl bg-surface p-4">
                <dt className="t-small text-muted-foreground">{t("รูปแบบ")}</dt>
                <dd className="mt-1 text-[1.5rem] font-semibold">9:16</dd>
              </div>
            </dl>
            <p className="t-small mt-3 text-muted-foreground">
              {t(" เวลาข้างบนเป็นการจำลองหน้าจอ ตัวเลขจริงจะวัดเมื่อเชื่อมระบบสร้างวิดีโอแล้ว ")}</p>

            <div className="mt-8 flex flex-col gap-3">
              <Button size="lg" disabled className="w-full">
                <Download /> {t(" ดาวน์โหลดคลิป (เร็ว ๆ นี้) ")}</Button>
              <Button variant="secondary" size="lg" className="w-full" onClick={reset}>
                <RotateCcw /> {t(" ทำสินค้าชิ้นใหม่ ")}</Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
