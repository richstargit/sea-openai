"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";

/** Puts text on the clipboard and says so for a moment. A blocked clipboard changes nothing: the text stays selectable on screen. */
export function CopyButton({ text, label = "คัดลอก", disabled }: { text: string; label?: string; disabled?: boolean }) {
  const { t } = useLanguage();
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return <button type="button" className="vs-btn ls-copy" disabled={disabled || !text} onClick={async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard can be blocked */ }
  }}>
    {done ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
    <span aria-live="polite">{t(done ? "คัดลอกแล้ว" : label)}</span>
  </button>;
}
