"use client";

import { useLanguage } from "@/components/language-provider";

import { ProductArt } from "@/components/product-art";
import { Badge } from "@/components/ui/badge";
import { QaChecks } from "@/components/sections/qa-checks";
import { products } from "@/lib/demo-data";

function Tile({
  step,
  title,
  body,
  className,
  children,
}: {
  step: number;
  title: string;
  body: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <article className={`tile flex flex-col p-7 sm:p-9 ${className ?? ""}`}>
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-full border border-foreground/25 text-[0.9375rem] font-semibold tabular-nums"
        >
          {t(step)}
        </span>
        <div>
          <h3 className="t-h3">{t(title)}</h3>
          <p className="mt-2 max-w-[30rem] text-muted-foreground">{t(body)}</p>
        </div>
      </div>
      <div className="mt-8 flex-1">{t(children)}</div>
    </article>
  );
}

const angleTransforms = [
  "rotate-[-5deg] scale-[1.12]",
  "rotate-[7deg] scale-[1.0] translate-x-1",
  "rotate-[-2deg] scale-[1.28] translate-y-2",
  "rotate-[12deg] scale-[1.08] -translate-x-1",
];

export function Pipeline() {
  const { t } = useLanguage();
  const food = products.food;
  return (
    <section id="snap" className="scroll-mt-12 bg-background">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <div className="max-w-[44rem]">
          <h2 className="t-h2">{t("ห้าขั้นตอน ทำเองทั้งหมด")}</h2>
          <p className="t-lead mt-5 text-muted-foreground">
            {t(" คุณถ่ายรูปกับตอบคำถามสั้น ๆ ที่เหลือคือหน้าที่ของระบบ ")}</p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          <Tile
            step={1}
            title={t("เข้าใจสินค้าจากรูป")}
            body={t("ดูรูปทุกมุมแล้วแยกประเภท สี วัสดุ จากนั้นถามเฉพาะสิ่งที่ยังขาด เช่น ราคาและโปรโมชัน")}
            className="lg:col-span-2"
          >
            <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr]">
              <div className="grid grid-cols-2 gap-2" aria-label={t("รูปสินค้าสี่มุม")} role="img">
                {angleTransforms.map((t, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-2xl bg-surface-2">
                    <ProductArt kind="food" className={`absolute inset-0 size-full ${t}`} />
                  </div>
                ))}
              </div>
              <dl className="flex flex-col justify-center gap-2 rounded-2xl bg-surface-2 p-4">
                {food.seen.map((s, i) => (
                  <div
                    key={s.label}
                    className={`flex items-baseline justify-between gap-4 border-border py-1.5 ${i ? "border-t" : ""}`}
                  >
                    <dt className="t-small text-muted-foreground">{t(s.label)}</dt>
                    <dd className="text-right font-medium">{t(s.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Tile>

          <Tile
            step={2}
            title={t("สร้าง 3D แล้วหมุนโชว์")}
            body={t("ทำโมเดลจากรูป ได้ช็อตหมุนรอบสินค้าพร้อมแสงและพื้นหลัง โดยไม่ต้องเข้าสตูดิโอ")}
          >
            <div className="@container relative mx-auto aspect-[5/4] w-full max-w-[320px]" role="img" aria-label={t("สินค้าหมุนรอบตัวบนเวทีแสง")}>
              <div className="absolute inset-x-[6%] top-[58%] h-[34%] -translate-y-1/2 rounded-[50%] border border-dashed border-foreground/30" />
              <ProductArt kind="food" className="absolute top-[2%] left-1/2 h-[88%] -translate-x-1/2" />
              {/* outer span drives x, inner drives y: together an ellipse */}
              <span
                aria-hidden
                className="absolute top-[58%] left-1/2 block size-3 -ml-1.5 -mt-1.5 animate-[orbit-x_6s_ease-in-out_infinite_alternate]"
              >
                <span className="block size-full animate-[orbit-y_6s_ease-in-out_-3s_infinite_alternate] rounded-full bg-brand" />
              </span>
            </div>
          </Tile>

          <Tile
            step={3}
            title={t("AI Director เขียนบท")}
            body={t("เขียนเป็นภาษาท้องถิ่น เรียงจาก hook ไปจุดขาย แล้วจบด้วยราคาและ CTA")}
          >
            <ol className="flex flex-col gap-2">
              {[
                ["0–3 วิ", "Hook", food.hook],
                ["3–10 วิ", "จุดขาย", food.selling],
                ["10–15 วิ", "ราคา · CTA", `${food.price} ${t(food.cta)}`],
              ].map(([time, k, line]) => (
                <li key={k} className="rounded-2xl bg-surface-2 p-3.5">
                  <div className="flex items-center justify-between t-small text-muted-foreground">
                    <span className="font-medium text-foreground">{t(k)}</span>
                    <span className="tabular-nums">{t(time)}</span>
                  </div>
                  <p className="mt-1 font-medium">{t(line)}</p>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="default">{t("ไทย")}</Badge>
              <Badge variant="ghost" className="border-border">Bahasa</Badge>
              <Badge variant="ghost" className="border-border">Tiếng Việt</Badge>
              <span className="t-small text-muted-foreground">{t("ภาษาอื่น ถ้าเวลาพอ")}</span>
            </div>
          </Tile>

          <Tile
            step={4}
            title={t("Codex เขียนฉากเป็นโค้ด")}
            body={t("เขียน motion graphic ด้วย HTML, GSAP และ Three.js ให้เข้ากับสินค้าชิ้นนั้น ไม่หยิบ template เดิมมาใส่")}
          >
            <pre className="overflow-x-auto rounded-2xl bg-[#1d1d1f] p-4 font-mono text-[0.8125rem] leading-[1.7] text-[#f5f5f7]" tabIndex={0} aria-label={t("ตัวอย่างโค้ดฉาก")}>
              <code>
                <span className="text-[#a1a1a6]">{t("// scene-food.html")}</span>
                {t("\n")}
                {t("tl.from(")}
                <span className="text-[#ffb27a]">&quot;.hook&quot;</span>
                {t(", { y: 48,\n  opacity: 0,\n  ease: ")}
                <span className="text-[#ffb27a]">&quot;expo.out&quot;</span>
                {t(" })\n  .to(")}
                bottle.rotation
                {t(", {\n  y: Math.PI * 2,\n  duration: 6 }, 0)")}
              </code>
            </pre>
          </Tile>

          <Tile
            step={5}
            title={t("ตรวจก่อน render จริง")}
            body={t("ระบบดูภาพเองก่อน ถ้าซับล้นหรือราคาอ่านยาก จะแก้ก่อนเสียเวลา render")}
          >
            <QaChecks />
          </Tile>
        </div>
      </div>
    </section>
  );
}
