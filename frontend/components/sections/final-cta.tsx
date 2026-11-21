"use client";

import { useLanguage } from "@/components/language-provider";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** The one full-bleed orange moment on the page. */
export function FinalCta() {
  const { t } = useLanguage();
  return (
    <section className="bg-background px-4 pb-24 sm:px-6 sm:pb-36">
      <div className="mx-auto max-w-[1080px] rounded-4xl bg-brand px-6 py-20 text-center text-brand-ink sm:py-28">
        <h2 className="t-h2 mx-auto max-w-[14em]">{t("ถ่ายรูปแรกของคุณ แล้วดูว่าได้คลิปแบบไหน")}</h2>
        <p className="t-lead mx-auto mt-5 max-w-[30rem] opacity-80">
          {t(" ใช้มือถือเครื่องเดียว สามถึงห้ามุม ไม่ต้องมีสตูดิโอ ")}</p>
        <Button asChild variant="dark" size="lg" className="mt-9">
          <Link href="/studio">{t("เริ่มทำคลิป")}</Link>
        </Button>
      </div>
    </section>
  );
}
