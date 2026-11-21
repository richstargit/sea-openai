"use client";

import { useLanguage } from "@/components/language-provider";

import Link from "next/link";
import { Wordmark } from "@/components/site-nav";

const cols = [
  {
    title: "ผลิตภัณฑ์",
    links: [
      { href: "/#snap", label: "ถ่ายรูป ได้คลิป" },
      { href: "/#products", label: "ตัวอย่างสินค้า" },
      { href: "/#hooks", label: "เวอร์ชัน A/B" },
      { href: "/#live", label: "ลูกมือ AI ตอนไลฟ์" },
    ],
  },
  {
    title: "เริ่มใช้งาน",
    links: [
      { href: "/studio", label: "ลองทำคลิปแรก" },
      { href: "/#measure", label: "เวลาและต้นทุนต่อคลิป" },
    ],
  },
];

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="bg-surface text-muted-foreground">
      <div className="mx-auto w-full max-w-[1080px] px-4 py-12 sm:px-6">
        <p className="t-small max-w-3xl border-b border-border pb-6">
          {t(" * เดโมนี้ใช้ข้อมูลจำลองทั้งหมด สินค้า ราคา และคอมเมนต์เป็นตัวอย่างประกอบ ไม่ได้เชื่อมต่อกับ TikTok Shop, Shopee, LINE หรือ Facebook จริง ชื่อแพลตฟอร์มเป็นของเจ้าของเครื่องหมายการค้านั้น ๆ ตัวเลขเวลาและต้นทุนจะแสดงเมื่อวัดจริงแล้วเท่านั้น ")}</p>

        <div className="grid gap-10 py-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Wordmark className="text-foreground" />
            <p className="t-small mt-3 max-w-xs">
              {t(" สำหรับผู้ขายรายย่อยและ SME ที่ไม่มีงบจ้างช่างภาพหรือคนตัดต่อ ")}</p>
          </div>
          {cols.map((c) => (
            <div key={c.title}>
              <h2 className="text-[0.9375rem] font-semibold text-foreground">{t(c.title)}</h2>
              <ul className="mt-3 flex flex-col">
                {c.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="t-small inline-flex min-h-9 items-center transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none rounded-sm"
                    >
                      {t(l.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="t-small border-t border-border pt-6">
          {t(" SnapPromo · โปรโตไทป์สำหรับ Hackathon ")}</p>
      </div>
    </footer>
  );
}
