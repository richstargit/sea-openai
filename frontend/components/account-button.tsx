"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";

export function AccountButton({ initialSignedIn }: { initialSignedIn: boolean }) {
  const { t } = useLanguage();
  const [signedIn, setSignedIn] = useState(initialSignedIn);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const result = await fetch("/auth/me", { cache: "no-store", signal: controller.signal });
        if (result.ok || result.status === 401) setSignedIn(result.ok);
      } catch {}
    }
    void refresh();
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); window.removeEventListener("focus", refresh); };
  }, []);

  async function signOut() {
    setError(false);
    try {
      const result = await fetch("/auth/logout", { method: "POST" });
      if (result.ok || result.status === 401) {
        window.location.replace("/login");
        return;
      }
    } catch {}
    setError(true);
  }

  if (!signedIn) return <Button asChild variant="ghost" size="sm"><Link href="/login">{t("เข้าสู่ระบบ")}</Link></Button>;
  return <form action="/auth/logout" method="post" onSubmit={(event) => { event.preventDefault(); void signOut(); }}>
    <Button type="submit" variant="ghost" size="sm">{t("ออกจากระบบ")}</Button>
    {error && <p role="alert" className="text-xs text-destructive">{t("ออกจากระบบไม่สำเร็จ กรุณาลองอีกครั้ง")}</p>}
  </form>;
}
