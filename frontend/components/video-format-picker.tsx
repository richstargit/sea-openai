"use client";

import { useId, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { Input } from "@/components/ui/input";
import { isValidVideoSize, videoFormats, videoRatio, type VideoSize } from "@/lib/video-formats";

type Props = {
  value: VideoSize;
  onChange: (value: VideoSize) => void;
  onValidityChange?: (valid: boolean) => void;
};

export function VideoFormatPicker({ value, onChange, onValidityChange }: Props) {
  const { t } = useLanguage();
  const id = useId();
  const [custom, setCustom] = useState(!videoFormats.some((format) => format.width === value.width && format.height === value.height));
  const [draft, setDraft] = useState({ width: String(value.width), height: String(value.height) });
  const valid = isValidVideoSize(Number(draft.width), Number(draft.height));

  function edit(key: "width" | "height", text: string) {
    const next = { ...draft, [key]: text };
    setDraft(next);
    const size = { width: Number(next.width), height: Number(next.height) };
    const allowed = isValidVideoSize(size.width, size.height);
    onValidityChange?.(allowed);
    if (allowed) onChange(size);
  }

  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-base font-semibold">{t("ขนาดและสัดส่วนวิดีโอ")}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {videoFormats.map((format) => {
          const selected = !custom && value.width === format.width && value.height === format.height;
          return (
            <button key={format.id} type="button" aria-pressed={selected}
              onClick={() => { setCustom(false); onChange({ width: format.width, height: format.height }); onValidityChange?.(true); }}
              className={`min-w-0 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? "border-brand-text bg-brand-wash" : "border-border bg-background hover:border-foreground/40"}`}>
              <span className="block text-lg font-semibold tabular-nums">{format.ratio}</span>
              <span className="mt-1 block text-sm font-medium">{t(format.label)}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t(format.channels)}</span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-pressed={custom}
        onClick={() => { setCustom(true); setDraft({ width: String(value.width), height: String(value.height) }); onValidityChange?.(true); }}
        className={`mt-2 min-h-11 w-full rounded-2xl border px-4 py-3 text-left text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${custom ? "border-brand-text bg-brand-wash" : "border-border bg-background"}`}>
        {t("กำหนดขนาดเอง")}
      </button>
      {custom && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            {(["width", "height"] as const).map((key) => (
              <div key={key}>
                <label htmlFor={`${id}-${key}`} className="mb-2 block text-sm font-medium">{t(key === "width" ? "ความกว้าง (px)" : "ความสูง (px)")}</label>
                <Input id={`${id}-${key}`} type="number" inputMode="numeric" min={64} max={7680} step={1} value={draft[key]}
                  onChange={(event) => edit(key, event.target.value)} aria-invalid={!valid} aria-describedby={`${id}-hint`} className="h-12 bg-background" />
              </div>
            ))}
          </div>
          <p id={`${id}-hint`} role={valid ? undefined : "alert"} className={`mt-2 text-sm ${valid ? "text-muted-foreground" : "text-destructive"}`}>
            {t(valid ? "กำหนดได้ตั้งแต่ 64 ถึง 7680 พิกเซลต่อด้าน" : "กรอกจำนวนเต็ม 64–7680 ทั้งสองด้าน พรีวิวยังใช้ขนาดล่าสุดที่ถูกต้อง")}
          </p>
        </div>
      )}
      <p className="mt-4 text-sm tabular-nums text-muted-foreground" aria-live="polite">{value.width} × {value.height} px · {videoRatio(value)}</p>
    </fieldset>
  );
}
