"use client";

import { LanguageSwitcher, useLanguage } from "@/components/language-provider";

import { AccountButton } from "@/components/account-button";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className ?? ""}`}>
      {/* shutter mark: an orange disc with the lens cut out */}
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle cx="12" cy="12" r="12" fill="var(--brand)" />
        <circle cx="12" cy="12" r="5.2" fill="none" stroke="var(--brand-ink)" strokeWidth="2.2" />
        <circle cx="12" cy="12" r="1.6" fill="var(--brand-ink)" />
      </svg>
      {/* On very narrow phones the name steps aside so the language and account controls fit on one row. */}
      <span className="max-[24rem]:sr-only">SnapPromo</span>
    </span>
  );
}

/**
 * Translucent global header: content scrolls underneath it. One row at every
 * width: the wordmark on the left, the language, account and try controls on
 * the right, both inside the same column the page content uses.
 */
export function SiteNav({ signedIn = false }: { signedIn?: boolean }) {
  const { t } = useLanguage();

  return (
    <header className="material sticky top-0 z-50 border-b">
      <div className="mx-auto flex min-h-16 w-full max-w-[1280px] items-center justify-between gap-3 py-2 pr-[max(1.25rem,env(safe-area-inset-right))] pl-[max(1.25rem,env(safe-area-inset-left))] sm:px-8">
        <Link href="/" className="inline-flex min-h-11 shrink-0 items-center rounded-md text-[1.0625rem] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60" aria-label={t("SnapPromo หน้าแรก")}>
          <Wordmark />
        </Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3 [&_a]:min-h-11 [&_button]:min-h-11">
          <LanguageSwitcher />
          <AccountButton initialSignedIn={signedIn} />
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/studio">{t("ลองทำคลิป")}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
