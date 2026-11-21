"use client";

import { useLanguage } from "@/components/language-provider";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Phone } from "@/components/phone";
import { ClipScene } from "@/components/clip-scene";
import { ProductArt } from "@/components/product-art";
import { products } from "@/lib/demo-data";
import { spring, fade } from "@/lib/spring";

const outputs = [
  "คลิปแนวตั้ง 9:16",
  "เสียงบรรยายภาษาท้องถิ่น",
  "ซับไตเติล",
  "เพลงที่ใช้ได้ถูกลิขสิทธิ์",
  "3 เวอร์ชัน hook สำหรับ A/B",
];

export function Hero() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const enter = (delay: number, x: number) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, x, y: 24 },
    animate: reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 },
    transition: reduce ? fade : { ...spring, duration: 0.7, delay },
  });

  return (
    <section className="overflow-hidden pt-14 text-center sm:pt-20">
      <div className="mx-auto max-w-[1080px] px-4 sm:px-6">
        <h1 className="t-hero">
          {t(" ถ่ายรูปสินค้า ")}<br />
          {t(" ได้คลิปโฆษณา ")}</h1>
        <p className="t-lead mx-auto mt-6 max-w-[34rem] text-muted-foreground">
          {t(" ถ่าย 3–5 มุมจากมือถือ แล้วระบบทำต่อให้ทั้งบท เสียง")}{t(" ")}
          <span className="whitespace-nowrap">{t("ซับไตเติล")}</span> {t(" และเพลง ได้คลิปพร้อมโพสต์ภายในไม่กี่นาที ")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <Button asChild size="lg">
            <Link href="/studio">{t("เริ่มทำคลิป")}</Link>
          </Button>
          <Link href="/#products" className="link-chevron min-h-11 text-[1.1875rem]">
            {t(" ดูตัวอย่างสินค้า ")}<ChevronRight className="size-5" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Keep the phone in document flow so the full preview determines the section height. */}
      <div className="relative mx-auto mt-12 w-full max-w-[1080px] px-4 pb-20 sm:mt-16 sm:px-6 sm:pb-24">
        <motion.div
          className="relative z-10 mx-auto w-[min(300px,68vw)]"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={reduce ? fade : { ...spring, duration: 0.8 }}
        >
          <Phone label={t("ตัวอย่างคลิปโฆษณา 9:16 ที่สร้างจากรูปสินค้า")}>
            <ClipScene
              product={products.food}
              hook={t("ข้าวสวยร้อน ๆ ต้องมีขวดนี้")}
              caption={t("พริกคั่วเองทุกล็อต")}
            />
          </Phone>
        </motion.div>

        {/* Input, left: what the seller gives us */}
        <motion.div
          {...enter(0.25, -40)}
          className="absolute top-28 left-6 hidden w-[250px] rounded-3xl bg-surface p-5 text-left lg:block"
        >
          <p className="text-[0.9375rem] font-semibold">{t("รูปจากมือถือ")}</p>
          <p className="t-small text-muted-foreground">{t("3–5 มุม ไม่ต้องเก็บฉาก")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              "rotate-[-5deg] scale-[1.12]",
              "rotate-[7deg] scale-[1.0] translate-x-1",
              "rotate-[-2deg] scale-[1.28] translate-y-2",
              "rotate-[12deg] scale-[1.08] -translate-x-1",
            ].map((t, i) => (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-2xl bg-white"
              >
                <ProductArt kind="food" className={`absolute inset-0 size-full ${t}`} />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Output, right: what comes back */}
        <motion.div
          {...enter(0.35, 40)}
          className="absolute top-40 right-6 hidden w-[250px] rounded-3xl bg-surface p-5 text-left lg:block"
        >
          <p className="text-[0.9375rem] font-semibold">{t("ได้อะไรกลับมา")}</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {outputs.map((o) => (
              <li key={o} className="flex items-start gap-2.5 t-small">
                <span
                  aria-hidden
                  className="mt-[0.45em] size-2 shrink-0 rounded-full bg-brand"
                />
                {t(o)}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
