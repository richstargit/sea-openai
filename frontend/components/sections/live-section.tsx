"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";

const rows = [
  { term: "ป้ายราคา", detail: "ใส่รหัสสินค้ากับราคา แล้วส่งขึ้นจอ" },
  { term: "กราฟิกโปร่งใส", detail: "สร้างจากบรีฟ ยาวสามวินาที เช่น ซื้อ 2 แถม 1" },
  { term: "คลิปบนจอ", detail: "เล่นคลิปที่สร้างไว้บนหน้าจอไลฟ์" },
];

export function LiveSection() {
  const { t } = useLanguage();
  return (
    <section id="live" className="mx-auto grid w-full max-w-[1280px] gap-10 px-5 py-24 sm:px-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-20 lg:py-36">
      <div>
        <h2 className="max-w-[10em] text-[clamp(2rem,4.2vw,3.5rem)] leading-[1.2] font-semibold tracking-[-0.02em] text-balance">
          {t("ป้ายราคาขึ้นจอไลฟ์ทันที")}
        </h2>
        <p className="mt-6 max-w-[30rem] text-[1.1875rem] leading-relaxed text-muted-foreground">
          {t("เชื่อมกับ OBS ผ่าน Browser Source ขนาด 1920 × 1080 แล้วส่งกราฟิกโปร่งใสเข้าจอไลฟ์")}
        </p>
        <Link
          href="/studio/live"
          className="mt-7 inline-flex min-h-11 items-center rounded-md text-[1.125rem] font-medium underline decoration-foreground/30 underline-offset-[0.3em] transition-colors outline-none hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60"
        >
          {t("เปิดสตูดิโอไลฟ์")}
        </Link>
      </div>
      <dl className="divide-y border-y self-start">
        {rows.map((row) => (
          <div key={row.term} className="py-6">
            <dt className="text-[1.375rem] font-semibold tracking-tight">{t(row.term)}</dt>
            <dd className="mt-1.5 text-[1.0625rem] leading-relaxed text-muted-foreground">{t(row.detail)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
