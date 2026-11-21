"use client";

import { LanguageSwitcher, useLanguage } from "@/components/language-provider";

import { AccountButton } from "@/components/account-button";
import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";

export const navLinks = [
  { href: "/#shop-features", label: "ฟีเจอร์สำหรับร้าน" },
  { href: "/#snap", label: "ถ่ายรูป ได้คลิป" },
  { href: "/#products", label: "ตัวอย่างสินค้า" },
  { href: "/#live", label: "ลูกมือไลฟ์" },
  { href: "/#measure", label: "วัดผล" },
  { href: "/editor", label: "ตัดต่อคลิป" },
];

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      {/* shutter mark: an orange disc with the lens cut out */}
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle cx="12" cy="12" r="12" fill="var(--brand)" />
        <circle cx="12" cy="12" r="5.2" fill="none" stroke="var(--brand-ink)" strokeWidth="2.2" />
        <circle cx="12" cy="12" r="1.6" fill="var(--brand-ink)" />
      </svg>
      SnapPromo
    </span>
  );
}

/**
 * Translucent global nav: content scrolls underneath it, the material carries
 * the hierarchy. Give the controls breathing room on every screen size.
 */
export function SiteNav({ signedIn = false }: { signedIn?: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <header className="material sticky top-0 z-50 border-b">
      <nav
        aria-label={t("เมนูหลัก")}
        className="mx-auto flex min-h-16 w-full max-w-[1280px] flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2 pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] sm:px-8"
      >
        <Link href="/" className="shrink-0 rounded-md py-2 text-[1.0625rem] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60" aria-label={t("SnapPromo หน้าแรก")}>
          <Wordmark />
        </Link>

        <ul className="hidden items-center gap-1 xl:flex">
          {navLinks.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="inline-flex min-h-9 items-center rounded-full px-3 text-[0.875rem] text-foreground/80 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/60 focus-visible:outline-none"
              >
                {t(l.label)}
              </Link>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3 lg:ml-0">
          <AccountButton initialSignedIn={signedIn} />
          <LanguageSwitcher />
          <Button asChild size="xs" className="hidden sm:inline-flex">
            <Link href="/studio">{t("ลองทำคลิป")}</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="xl:hidden" aria-label={t("เปิดเมนู")}>
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="top" className="material gap-0 rounded-b-3xl border-b px-6 pb-8">
              <SheetHeader className="px-0">
                <SheetTitle className="text-left text-[1.0625rem]">
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <ul className="mt-2 flex flex-col">
                {navLinks.map((l) => (
                  <li key={l.href} className="border-b border-border last:border-0">
                    <SheetClose asChild>
                      <Link href={l.href} className="flex min-h-14 items-center text-[1.5rem] font-semibold tracking-tight">
                        {t(l.label)}
                      </Link>
                    </SheetClose>
                  </li>
                ))}
              </ul>
              <SheetClose asChild>
                <Button asChild size="lg" className="mt-6 w-full">
                  <Link href="/studio">{t("ลองทำคลิป")}</Link>
                </Button>
              </SheetClose>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
