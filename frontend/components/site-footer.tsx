"use client";

import Link from "next/link";
import { useLanguage } from "@/components/language-provider";
import { Wordmark } from "@/components/site-nav";

const links = [
  { href: "/studio", label: "สตูดิโอวิดีโอ" },
  { href: "/studio/live", label: "สตูดิโอไลฟ์" },
];

export function SiteFooter() {
  const { t } = useLanguage();
  return (
    <footer className="bg-surface text-muted-foreground">
      <div className="mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-10 sm:px-8">
        <Wordmark className="text-foreground" />
        <nav aria-label={t("ลิงก์ท้ายหน้า")}>
          <ul className="flex flex-wrap gap-x-6">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-sm text-[0.9375rem] outline-none transition-colors hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/60"
                >
                  {t(link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="w-full text-[0.9375rem]">{t("โปรโตไทป์สำหรับ Hackathon")}</p>
      </div>
    </footer>
  );
}
