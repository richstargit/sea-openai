"use client";

import { motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { fade, spring } from "@/lib/spring";

export function Hero() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto grid w-full max-w-[1280px] items-center gap-12 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-16 lg:pt-16 lg:pb-24">
      <div>
        <h1 className="max-w-[12em] text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.2] font-semibold tracking-[-0.02em] text-balance">
          {t("ไลฟ์คนเดียว แต่มีทีม AI ทั้งทีม")}
        </h1>
        <p className="mt-6 max-w-[30rem] text-[1.1875rem] leading-relaxed text-muted-foreground sm:text-[1.3125rem]">
          {t("ใส่คลังสินค้า เลือกสไตล์ไลฟ์ แล้วกดไลฟ์ ระบบจับสินค้าที่ยกขึ้นมา ฟังที่พูด คิดบทให้ และเด้งกราฟิกเข้า OBS แบบเรียลไทม์")}
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Button asChild size="lg">
            <Link href="/studio/live">{t("เริ่มไลฟ์กับทีม AI")}</Link>
          </Button>
          <Link
            href="/studio"
            className="inline-flex min-h-11 items-center rounded-md text-[1.125rem] font-medium underline decoration-foreground/30 underline-offset-[0.3em] transition-colors outline-none hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60"
          >
            {t("สร้างวิดีโอสินค้า")}
          </Link>
        </div>
      </div>

      <motion.div
        className="relative mx-auto aspect-[941/1672] w-[min(100%,20rem)] overflow-hidden rounded-[2rem] bg-surface lg:ml-auto lg:h-[min(74svh,40rem)] lg:w-auto"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={reduce ? fade : { ...spring, duration: 0.6 }}
      >
        <Image
          src="/studio/daily-glow.jpg"
          alt={t("รูปสินค้าตัวอย่าง เซรั่มขวดแก้วสีอำพันบนแท่นหิน แสงทองยามบ่าย")}
          fill
          sizes="(min-width: 1024px) 24rem, 20rem"
          loading="eager"
          fetchPriority="high"
          className="object-cover"
        />
      </motion.div>
    </section>
  );
}
