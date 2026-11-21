"use client";

import { useLanguage } from "@/components/language-provider";

const steps = [
  { title: "ใส่รูปสินค้า", body: "รูป PNG หนึ่งรูป พร้อมไอเดียสั้นๆ หรือคลิปและลิงก์อ้างอิง" },
  { title: "ระบบวางช็อต", body: "เลือกสไตล์ กรอบภาพ การเคลื่อนกล้อง และตำแหน่งข้อความ" },
  { title: "ได้คลิปแนวตั้ง", body: "WebM ขนาด 720 × 1280 ยาวหกวินาที ดาวน์โหลดได้ทันที" },
];

export function VideoSteps() {
  const { t } = useLanguage();
  return (
    <section id="video" className="mx-auto grid w-full max-w-[1280px] gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20 lg:py-36">
      <h2 className="max-w-[10em] text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.2] font-semibold tracking-[-0.02em] text-balance">
        {t("สามขั้น จากรูปถึงคลิป")}
      </h2>
      <ol className="divide-y border-y">
        {steps.map((step, index) => (
          <li key={step.title} className="grid grid-cols-[2.25rem_1fr] gap-x-4 py-7">
            <span className="text-[1.25rem] font-medium text-muted-foreground tabular-nums">{index + 1}</span>
            <div>
              <h3 className="text-[1.375rem] font-semibold tracking-tight">{t(step.title)}</h3>
              <p className="mt-1.5 max-w-[30rem] text-[1.0625rem] leading-relaxed text-muted-foreground">{t(step.body)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
