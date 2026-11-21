"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

/** The one full-bleed orange moment on the page. */
export function FinalCta() {
  const { t } = useLanguage();
  return (
    <section className="px-5 pb-24 sm:px-8 lg:pb-36">
      <div className="mx-auto max-w-[1280px] rounded-[2rem] bg-brand px-6 py-16 text-brand-ink sm:px-12 sm:py-20">
        <h2 className="max-w-[12em] text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.2] font-semibold tracking-[-0.02em] text-balance">
          {t("เริ่มจากสตูดิโอวิดีโอ")}
        </h2>
        <p className="mt-4 text-[1.1875rem]">{t("เข้าสู่ระบบก่อนใช้งาน")}</p>
        <Button asChild variant="dark" size="lg" className="mt-8">
          <Link href="/studio">{t("เปิดสตูดิโอ")}</Link>
        </Button>
      </div>
    </section>
  );
}
