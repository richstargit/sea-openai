"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LanguageSwitcher, useLanguage } from "@/components/language-provider";
import { Wordmark } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useLanguage();
  const signingUp = mode === "register";
  const title = signingUp ? "สมัครสมาชิก" : "เข้าสู่ระบบ";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: fields.get("email"), password: fields.get("password") }),
      });
      if (response.ok) {
        window.location.replace("/studio");
        return;
      }
      const messages: Record<number, string> = {
        401: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
        409: "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ",
        422: "กรุณาตรวจสอบอีเมลและรหัสผ่าน",
        429: "ลองหลายครั้งเกินไป กรุณาลองอีกครั้งภายหลัง",
      };
      setError(messages[response.status] ?? "ติดต่อระบบบัญชีไม่ได้ กรุณาลองอีกครั้ง");
    } catch {
      setError("ติดต่อระบบบัญชีไม่ได้ กรุณาลองอีกครั้ง");
    }
    setBusy(false);
  }

  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center justify-between px-5">
          <Link href="/" aria-label={t("SnapPromo หน้าแรก")}><Wordmark /></Link>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-6 pt-16 pb-12 sm:pt-24">
        <h1 className="text-4xl font-semibold tracking-tight">{t(title)}</h1>
        <form method="post" action={`/auth/${mode}`} onSubmit={submit} className="mt-8 grid gap-5">
          <div className="grid gap-2">
            <label htmlFor={`${mode}-email`}>{t("อีเมล")}</label>
            <Input className="h-12" id={`${mode}-email`} name="email" type="email" required autoComplete="email" maxLength={254} />
          </div>
          <div className="grid gap-2">
            <label htmlFor={`${mode}-password`}>{t("รหัสผ่าน")}</label>
            <Input className="h-12" id={`${mode}-password`} name="password" type="password" required minLength={signingUp ? 12 : 1} maxLength={128} autoComplete={signingUp ? "new-password" : "current-password"} aria-describedby={signingUp ? "password-hint" : undefined} />
            {signingUp && <p id="password-hint" className="text-sm text-muted-foreground">{t("ใช้รหัสผ่านอย่างน้อย 12 ตัวอักษร")}</p>}
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{t(error)}</p>}
          <Button type="submit" size="lg" disabled={busy}>{t(busy ? "กำลังดำเนินการ…" : title)}</Button>
        </form>
        <p className="mt-6 text-sm text-muted-foreground">
          {t(signingUp ? "มีบัญชีแล้ว?" : "ยังไม่มีบัญชี?")}{" "}
          <a className="font-medium text-foreground underline underline-offset-4" href={signingUp ? "/login" : "/register"}>{t(signingUp ? "เข้าสู่ระบบ" : "สมัครสมาชิก")}</a>
        </p>
      </main>
    </>
  );
}
