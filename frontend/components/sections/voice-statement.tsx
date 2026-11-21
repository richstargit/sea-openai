"use client";

import { useLanguage } from "@/components/language-provider";

export function VoiceStatement() {
  const { t } = useLanguage();
  return (
    <section id="voice" className="bg-surface">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-24 sm:px-8 lg:py-36">
        <h2 className="max-w-[16em] text-[clamp(1.75rem,3.6vw,3rem)] leading-[1.3] font-semibold tracking-[-0.015em] text-balance">
          {t("เรียนรู้สไตล์การพูดจากคลิปที่คุณชอบ แล้วเขียนบทให้สินค้าใหม่")}
        </h2>
        <p className="mt-8 max-w-[34rem] text-[1.1875rem] leading-relaxed text-muted-foreground">
          {t("พากย์เป็นอังกฤษหรือไทย เลือกสไตล์เสียงได้หลายแบบ แล้วฟังเทียบกันพร้อมคะแนนของแต่ละเทค ไฟล์เสียงแยกจากคลิป และระบุว่าเป็นเสียง AI ทุกไฟล์")}
        </p>
      </div>
    </section>
  );
}
