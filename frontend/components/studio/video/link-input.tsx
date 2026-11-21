"use client";

import { useId } from "react";
import { useLanguage } from "@/components/language-provider";
import { host } from "../script/api";
import { classifyLinks, PLATFORM_NAME } from "../script/links";

const SHOWN = 3;

/** A paste area and a one line verdict. Only links that will be skipped get a row, with the reason. */
export function LinkInput({ value, onChange, known, room, disabled, label, rows = 4 }: {
  value: string; onChange: (value: string) => void; known: string[]; room: number; disabled?: boolean; label: string; rows?: number;
}) {
  const { t } = useLanguage();
  const id = useId();
  const { rows: checked, accepted } = classifyLinks(value, known, room);
  const skipped = checked.filter((row) => !row.ok);

  return <div className="vs-field">
    <label htmlFor={id}>{label}</label>
    <textarea id={id} className="vs-drop-field" rows={rows} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}
      placeholder={t("TikTok YouTube Instagram บรรทัดละลิงก์")} aria-describedby={`${id}-count`} />
    <p className="vs-hint" id={`${id}-count`} aria-live="polite">
      {checked.length > 0 && `${t("รับได้")} ${accepted.length} ${t("จาก")} ${checked.length}`}
    </p>
    {skipped.length > 0 && <ul className="vs-skips">
      {skipped.slice(0, SHOWN).map((row, n) => <li key={`${row.raw}-${n}`}>
        <b>{row.platform ? PLATFORM_NAME[row.platform] : host(row.raw)}</b>
        <span>{t(row.reason)}</span>
      </li>)}
      {skipped.length > SHOWN && <li><span>{t("และอีก")} {skipped.length - SHOWN} {t("ลิงก์")}</span></li>}
    </ul>}
  </div>;
}
