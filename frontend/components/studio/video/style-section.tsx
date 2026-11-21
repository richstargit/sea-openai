"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { api, readyFirst } from "../script/api";
import type { JobStatus, Profile, ProfileSummary } from "../script/types";
import { ActiveStyle } from "./active-style";
import { Notice, StateChip } from "./kit";
import { NewStyle } from "./new-style";

const REMEMBER = "snappromo-script-profile";
// Stored when the user chose to work without a style on purpose, so the choice is not mistaken for "nothing picked yet".
const NONE = "none";

/** `skipped` means the style is optional on this page and the user chose none: the work goes ahead with a neutral voice. */
export type StyleState = { id: string; name: string; status: "loading" | "none" | "skipped" | JobStatus };

function remembered(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

/**
 * The style row: pick one you made before, or make a new one from links. Reports which style is active and whether it is ready.
 * With `allowNone` the style is optional: a first option works without one, and a user with no styles yet is not forced
 * to make one. `rememberKey` keeps this page's choice apart from the other pages that use the row.
 */
export function StyleSection({ onState, disabled, allowNone = false, rememberKey = REMEMBER }: {
  onState: (state: StyleState) => void; disabled?: boolean; allowNone?: boolean; rememberKey?: string;
}) {
  const { t } = useLanguage();
  const [profiles, setProfiles] = useState<ProfileSummary[] | null>(null);
  const [activeId, setActiveId] = useState("");
  const [creating, setCreating] = useState(false);
  const [maxClips, setMaxClips] = useState(20);
  const [error, setError] = useState("");
  // Choosing a style swaps the block below the select, so focus goes back to the select after it.
  const select = useRef<HTMLSelectElement>(null);

  const pick = useCallback((id: string) => {
    setActiveId(id);
    try {
      if (id) localStorage.setItem(rememberKey, id);
      else if (allowNone) localStorage.setItem(rememberKey, NONE);
      else localStorage.removeItem(rememberKey);
    } catch { /* storage is optional */ }
  }, [rememberKey, allowNone]);

  const load = useCallback(() => {
    api.profiles().then((list) => {
      setProfiles(list);
      // The remembered style if it still exists (or the remembered choice of none), else the newest one that can write a script.
      const saved = remembered(rememberKey);
      const keepNone = allowNone && saved === NONE;
      setActiveId((list.find((p) => p.id === saved) ?? (keepNone ? undefined : readyFirst(list)))?.id ?? "");
    }).catch((e: Error) => { setError(e.message); setProfiles([]); });
    api.capabilities().then((c) => setMaxClips(c.maxSources)).catch(() => undefined);
  }, [rememberKey, allowNone]);

  useEffect(() => { load(); }, [load]);

  const active = profiles?.find((p) => p.id === activeId);
  useEffect(() => {
    if (profiles === null) onState({ id: "", name: "", status: "loading" });
    else if (active) onState({ id: active.id, name: active.name, status: active.status });
    else onState({ id: "", name: "", status: allowNone ? "skipped" : "none" });
  }, [profiles, active, onState, allowNone]);

  const created = useCallback((profile: ProfileSummary) => {
    setProfiles((list) => [profile, ...(list ?? [])]);
    pick(profile.id);
    setCreating(false);
  }, [pick]);

  // The select follows what the active style learns, so a style that finishes analysing shows as ready here.
  const synced = useCallback((p: Profile) => {
    setProfiles((list) => list?.map((x) => x.id === p.id
      ? { ...x, name: p.name, status: p.status, sourceCount: p.sources.length, doneCount: p.sources.filter((s) => s.status === "done").length }
      : x) ?? list);
  }, []);

  const removed = useCallback((id: string) => {
    const rest = (profiles ?? []).filter((p) => p.id !== id);
    setProfiles(rest);
    pick(readyFirst(rest)?.id ?? "");
  }, [profiles, pick]);

  if (profiles === null) return <p className="vs-hint" role="status">{t("กำลังโหลด")}</p>;

  const first = profiles.length === 0;
  // When the style is required a user with none must make one, so the panel opens by itself; when it is optional the row stays.
  const forced = first && !allowNone;

  return <div className="vs-style">
    {error && <Notice tone="error" action={<button type="button" className="vs-btn" onClick={() => { setError(""); load(); }}>{t("ลองใหม่")}</button>}>{t(error)}</Notice>}
    {!forced && <div className="vs-style-line">
      <select ref={select} className="vs-select" aria-label={t("สไตล์ที่ใช้")} value={activeId} disabled={disabled}
        onChange={(event) => { pick(event.target.value); requestAnimationFrame(() => select.current?.focus({ preventScroll: true })); }}>
        {allowNone && <option value="">{t("ไม่ใช้สไตล์")}</option>}
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {active && <StateChip status={active.status} />}
      <button type="button" className="vs-btn" aria-expanded={creating} disabled={disabled} onClick={() => setCreating((open) => !open)}>
        <Plus size={16} aria-hidden />{t("สไตล์ใหม่")}
      </button>
    </div>}
    {(creating || forced) && <NewStyle maxClips={maxClips} onCreated={created} />}
    {activeId && <ActiveStyle key={activeId} profileId={activeId} maxClips={maxClips} onSummary={synced} onDeleted={() => removed(activeId)} />}
  </div>;
}
