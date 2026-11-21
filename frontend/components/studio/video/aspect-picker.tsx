"use client";

import { useLanguage } from "@/components/language-provider";
import { ASPECTS, type Aspect } from "./api";

/**
 * The shape of the finished video. Each option draws its own frame with CSS so the ratio can be seen,
 * and one quiet line under the control says where that shape is used.
 */
export function AspectPicker({ value, onChange, disabled }: { value: Aspect; onChange: (value: Aspect) => void; disabled?: boolean }) {
  const { t } = useLanguage();
  const current = ASPECTS.find((a) => a.id === value) ?? ASPECTS[0];
  return <div className="vs-group">
    <span className="vs-label" id="vs-aspect-label">{t("ขนาดวิดีโอ")}</span>
    <div className="vs-seg vs-seg-frames" role="radiogroup" aria-labelledby="vs-aspect-label">
      {ASPECTS.map((a) => <label key={a.id}>
        <input type="radio" name="vs-aspect" value={a.id} checked={value === a.id} disabled={disabled} onChange={() => onChange(a.id)} />
        <span>
          <i className="vs-frame" style={{ aspectRatio: `${a.w} / ${a.h}` }} aria-hidden />
          <b>{a.id}</b>
          <small>{t(a.word)}</small>
        </span>
      </label>)}
    </div>
    <p className="vs-hint" role="status">{t(current?.hint ?? "")}</p>
  </div>;
}
