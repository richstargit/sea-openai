"use client";

import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { api } from "../script/api";
import { classifyLinks } from "../script/links";
import type { ProfileSummary } from "../script/types";
import { Notice } from "./kit";
import { LinkInput } from "./link-input";

/**
 * Make a style from links: a name, the links and one button. Submitting makes the style,
 * adds the clips and starts the analysis, so there is nothing else to find.
 */
export function NewStyle({ maxClips, onCreated }: { maxClips: number; onCreated: (profile: ProfileSummary) => void }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [links, setLinks] = useState("");
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  const { accepted, rows } = classifyLinks(links, [], maxClips);
  const busy = step !== "";
  const reason = !name.trim() ? "ตั้งชื่อสไตล์ก่อน" : accepted.length === 0 ? (rows.length ? "ยังไม่มีลิงก์ที่รับได้" : "วางลิงก์คลิปอย่างน้อยหนึ่งลิงก์") : "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (reason || busy) return;
    setError("");
    let createdId = "";
    try {
      setStep("กำลังสร้างสไตล์");
      const profile = await api.createProfile(name.trim());
      createdId = profile.id;
      setStep("กำลังเพิ่มลิงก์");
      const added = await api.addSources(profile.id, accepted);
      setStep("กำลังเริ่มวิเคราะห์");
      await api.analyze(profile.id);
      onCreated({ id: profile.id, name: profile.name, language: profile.language, status: "running", createdAt: profile.createdAt, sourceCount: added.profile.sources.length, doneCount: 0, mock: false });
      setName("");
      setLinks("");
    } catch (e) {
      // The style was made a moment ago for these links only, so a failed start leaves nothing half made behind.
      if (createdId) await api.deleteProfile(createdId).catch(() => undefined);
      setError(e instanceof Error ? e.message : "ลองอีกครั้ง");
    } finally {
      setStep("");
    }
  }

  return <form className="vs-new" onSubmit={submit} aria-label={t("สไตล์ใหม่")}>
    <div className="vs-field">
      <label htmlFor="vs-style-name">{t("ชื่อสไตล์")}</label>
      <input id="vs-style-name" value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} placeholder={t("เช่น รีวิวของใช้ในบ้าน")} />
    </div>
    <LinkInput value={links} onChange={setLinks} known={[]} room={maxClips} disabled={busy} label={t("ลิงก์คลิป")} rows={4} />
    <div className="vs-actions">
      <button type="submit" className="vs-btn" disabled={Boolean(reason) || busy}>
        {busy && <LoaderCircle className="animate-spin" size={16} aria-hidden />}
        {t("สร้างสไตล์")}
      </button>
      <span className="vs-hint" role="status">{busy ? t(step) : reason ? t(reason) : ""}</span>
    </div>
    {error && <Notice tone="error">{t(error)}</Notice>}
  </form>;
}
