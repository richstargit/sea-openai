"use client";

import { useState } from "react";
import { Store, Package, Mic, Clapperboard, AudioLines, Sparkles, Tags, Download, Check } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { ProductArt } from "@/components/product-art";
import { shopFeatures } from "@/lib/shop-features";

const icons = { Store, Package, Mic, Clapperboard, AudioLines, Sparkles, Tags, Download };
const themes = [
  { name: "อบอุ่นเป็นกันเอง", background: "#321b13", ink: "#fff4e8", accent: "#fe7802", swatches: ["#321b13", "#fe7802", "#fff4e8"] },
  { name: "สะอาดเรียบง่าย", background: "#edf3ef", ink: "#183b2c", accent: "#b7d9c4", swatches: ["#183b2c", "#b7d9c4", "#edf3ef"] },
  { name: "สดใสกระชับ", background: "#332063", ink: "#ffffff", accent: "#f3db67", swatches: ["#332063", "#f3db67", "#ffffff"] },
];

export function ShopWorkflow() {
  const { t } = useLanguage();
  const [selected, setSelected] = useState(0);
  const theme = themes[selected];

  return (
    <section id="shop-features" aria-labelledby="shop-features-title" className="scroll-mt-24 bg-background">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <div className="max-w-[46rem]">
          <p className="text-base font-semibold text-brand-text">{t("ฟีเจอร์สำหรับร้าน")}</p>
          <h2 id="shop-features-title" className="t-h2 mt-4">{t("ตัวตนร้านชัด ทำคลิปต่อได้ทุกวัน")}</h2>
          <p className="t-lead mt-5 text-muted-foreground">{t("ตั้งค่าร้าน เก็บสินค้า แล้วเปลี่ยนไอเดียเป็นคลิปที่ตรวจเองได้ทุกขั้นตอน ตั้งแต่บรีฟจนถึงไฟล์พร้อมโพสต์")}</p>
        </div>

        <div className="tile mt-12 grid items-center gap-10 p-6 sm:p-10 md:grid-cols-[1fr_240px] md:gap-16">
          <div className="min-w-0">
            <p className="text-base font-semibold text-brand-text">{t("ตั้งค่าครั้งเดียว ใช้ต่อได้ทุกคลิป")}</p>
            <h3 className="t-h3 mt-3 max-w-[24rem]">{t("ธีมเดียวกัน ตั้งแต่โลโก้ถึงประโยคสุดท้าย")}</h3>
            <p className="mt-4 max-w-[28rem] text-muted-foreground">{t("เลือกธีมตัวอย่างเพื่อดูสีและโทนของพรีวิว รายละเอียดเฉพาะคลิปปรับทับธีมหลักได้")}</p>
            <div role="group" aria-label={t("ตัวอย่างธีมร้าน")} className="mt-6 flex flex-wrap gap-2">
              {themes.map((item, index) => (
                <button key={item.name} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected === index ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:border-foreground/40"}`}>
                  <span aria-hidden className="size-3 shrink-0 rounded-full border border-current/20" style={{ background: item.accent }} />
                  {t(item.name)}
                </button>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-3" aria-label={t("สีหลักของธีม")}>
              {theme.swatches.map((color) => <span key={color} className="size-8 rounded-full border border-foreground/15" style={{ background: color }} title={color} />)}
              <span className="text-sm text-muted-foreground">{t(theme.name)}</span>
            </div>
          </div>
          <figure className="mx-auto w-full max-w-[240px]">
            <div className="relative flex aspect-[9/16] flex-col overflow-hidden rounded-3xl p-5 shadow-lg transition-colors motion-reduce:transition-none" style={{ background: theme.background, color: theme.ink }}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: theme.accent, color: theme.background }}><Store className="size-4" /></span>
                {t("บ้านพริก")}
              </div>
              <p className="mt-6 text-xl font-semibold leading-snug">{t("อร่อยง่าย ๆ ในทุกมื้อ")}</p>
              <ProductArt kind="food" className="mx-auto my-auto h-auto w-32 max-w-full" />
              <p className="rounded-xl px-3 py-2 text-center text-sm font-semibold" style={{ background: theme.accent, color: theme.background }}>{t("พริกคั่วเองทุกล็อต")}</p>
            </div>
            <figcaption className="mt-4 text-center text-sm text-muted-foreground">{t("ตัวอย่างพรีวิวประกอบฟีเจอร์")}</figcaption>
          </figure>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {shopFeatures.map((feature) => {
            const Icon = icons[feature.icon];
            return (
              <article key={feature.icon} className="tile min-w-0 p-6 sm:p-8">
                <span aria-hidden className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-brand-wash text-brand-text"><Icon className="size-6" /></span>
                <h3 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{t(feature.title)}</h3>
                <p className="mt-3 text-muted-foreground">{t(feature.description)}</p>
                <ul className="mt-5 space-y-3 border-t border-border pt-5">
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-3 text-base">
                      <Check aria-hidden className="mt-1 size-4 shrink-0 text-brand-text" />
                      <span>{t(detail)}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
