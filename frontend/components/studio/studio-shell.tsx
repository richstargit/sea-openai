"use client";

import Link from "next/link";
import { Clapperboard, Radio, Scissors } from "lucide-react";
import { AccountButton } from "@/components/account-button";
import { LanguageSwitcher, useLanguage } from "@/components/language-provider";
import { Wordmark } from "@/components/site-nav";
import "./workspace.css";

export function StudioShell({ live, children }: { live: boolean; children: React.ReactNode }) {
  const { t } = useLanguage();
  return <div className={`studio-shell ${live ? "studio-live" : ""}`}>
    <header className="studio-header">
      <Link href="/" aria-label={t("SnapPromo หน้าแรก")}><Wordmark /></Link>
      <div><LanguageSwitcher /><AccountButton initialSignedIn /></div>
    </header>
    <main id="main" className="studio-main">
      <nav className="studio-nav" aria-label={t("พื้นที่ทำงาน")}>
        <Link href="/studio" aria-current={live ? undefined : "page"}><Clapperboard />{t("สตูดิโอวิดีโอ")}</Link>
        <Link href="/studio/live" aria-current={live ? "page" : undefined}><Radio />{t("สตูดิโอไลฟ์")}</Link>
        <Link href="/editor" className="studio-editor-link"><Scissors />{t("ตัดต่อคลิป")}</Link>
      </nav>
      {children}
    </main>
  </div>;
}
