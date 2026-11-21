"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { api } from "../script/api";
import type { VoiceOptions } from "../script/types";

export type VoiceChoice = { language: string; voice: string };

// Used when the options endpoint cannot be reached. English first and marin preselected, the best voice OpenAI lists.
const FALLBACK_LANGUAGES = ["en", "th", "ja", "zh", "es", "id", "vi"];
const FALLBACK_VOICES = ["marin", "cedar", "alloy", "ash", "ballad", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer", "verse"];
export const LANGUAGE_NAME: Record<string, string> = {
  en: "อังกฤษ", th: "ไทย", ja: "ญี่ปุ่น", zh: "จีน", es: "สเปน", id: "อินโดนีเซีย", vi: "เวียดนาม",
};
const BEST_VOICE = "marin";

export function useVoiceOptions(): VoiceOptions | null {
  const [options, setOptions] = useState<VoiceOptions | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.voiceOptions().then((loaded) => { if (!cancelled) setOptions(loaded); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  return options;
}

/** Two choices only: the language the video speaks and the voice. Everything else is decided for the user. */
export function VoiceRow({ value, onChange, options, disabled }: {
  value: VoiceChoice; onChange: (value: VoiceChoice) => void; options: VoiceOptions | null; disabled?: boolean;
}) {
  const { t } = useLanguage();

  const codes = options?.languages.length ? options.languages.map((l) => l.code) : FALLBACK_LANGUAGES;
  // English always leads the list, whatever order the server sends.
  const languages = [...codes].sort((a, b) => Number(b === "en") - Number(a === "en"));
  const name = (code: string) => t(LANGUAGE_NAME[code] ?? options?.languages.find((l) => l.code === code)?.label ?? code);

  const model = options?.models.find((m) => m.id === options.defaults.model) ?? options?.models[0];
  const voices = model?.voices.length ? model.voices.map((v) => v.id) : FALLBACK_VOICES;
  const best = options?.defaults.voice ?? BEST_VOICE;

  return <details className="vs-more vs-voice">
    <summary>
      <span className="vs-label">{t("เสียงพากย์")}</span>
      <span className="vs-voice-now"><span>{name(value.language)}</span><span>{value.voice}</span></span>
    </summary>
    <div className="vs-voice-fields">
      <div className="vs-field">
        <label htmlFor="vs-language">{t("ภาษา")}</label>
        <select id="vs-language" className="vs-select vs-select-sm" value={value.language} disabled={disabled} onChange={(event) => onChange({ ...value, language: event.target.value })}>
          {languages.map((code) => <option key={code} value={code}>{name(code)}</option>)}
        </select>
      </div>
      <div className="vs-field">
        <label htmlFor="vs-voice">{t("เสียงพากย์")}</label>
        <select id="vs-voice" className="vs-select vs-select-sm" value={value.voice} disabled={disabled} onChange={(event) => onChange({ ...value, voice: event.target.value })}>
          {voices.map((id) => <option key={id} value={id}>{id === best ? `${id} (${t("ดีที่สุด")})` : id}</option>)}
        </select>
      </div>
    </div>
  </details>;
}
