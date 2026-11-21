"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import { type StyleState, StyleSection } from "../video/style-section";
import { type Photo, PhotoComposer } from "../video/photo-composer";
import { type Offer, type TextSize, cleanOffer, recallSize, rememberSize } from "./api";
import { ListenBar, PrepareBar } from "./live-dock";
import { LivePanel } from "./live-panel";
import { useListening } from "./use-listening";
import { useShow } from "./use-show";

const CONSENT_KEY = "snappromo-live-consent";
const PROFILE_KEY = "snappromo-live-profile";

function recallConsent(): boolean {
  try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; }
}
function rememberConsent() {
  try { localStorage.setItem(CONSENT_KEY, "1"); } catch { /* storage is optional */ }
}

/** The one reason the prepare button cannot work yet, in the order the seller should fix it. */
function blocker(hasInput: boolean, style: StyleState): string {
  if (!hasInput) return "ใส่รูปหรือไอเดียก่อน";
  if (style.status === "loading") return "กำลังโหลดสไตล์";
  if (style.status === "running") return "รอวิเคราะห์สไตล์เสร็จ";
  if (style.status !== "ready" && style.status !== "skipped") return "สไตล์ยังไม่พร้อม";
  return "";
}

const OFFER_FIELDS: { key: keyof Offer; label: string; placeholder: string }[] = [
  { key: "price", label: "ราคา", placeholder: "เช่น 299 บาท" },
  { key: "promotion", label: "โปรโมชัน", placeholder: "เช่น ซื้อ 2 แถม 1" },
  { key: "stock", label: "จำนวนที่มี", placeholder: "เช่น เหลือ 50 ชิ้น" },
  { key: "endsAt", label: "หมดเวลา", placeholder: "เช่น ถึง 4 ทุ่มคืนนี้" },
];

/**
 * The seller's side of the live script. First the preparation (photo and idea, the offer, the style, one button),
 * then, once the script is ready, the live panel with the floating Start listening button.
 * `children` sit between the content and the floating bar, which must stay the last thing on the page.
 */
export function LiveScriptStudio({ onPrompterUrl, children }: { onPrompterUrl: (url: string | null) => void; children?: ReactNode }) {
  const { t } = useLanguage();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [brief, setBrief] = useState("");
  const [offer, setOffer] = useState<Offer>({});
  const [style, setStyle] = useState<StyleState>({ id: "", name: "", status: "loading" });
  const [size, setSize] = useState<TextSize>("m");
  const [consented, setConsented] = useState(false);
  const [armed, setArmed] = useState(false);
  const { show, problem, starting, start, reset } = useShow();

  // What was remembered comes back after the first paint, so the server and the browser render the same markup.
  useEffect(() => {
    queueMicrotask(() => { setSize(recallSize()); setConsented(recallConsent()); });
  }, []);
  const chooseSize = useCallback((next: TextSize) => { setSize(next); rememberSize(next); }, []);

  const ready = show?.status === "ready";
  const listen = useListening({ showId: show?.id ?? "", enabled: ready, keyboard: ready && consented && !armed });

  const prompter = listen.prompterUrl ?? show?.prompterUrl ?? null;
  useEffect(() => { onPrompterUrl(prompter); }, [prompter, onPrompterUrl]);

  const working = starting || show?.status === "running";
  const reason = blocker(photos.length > 0 || brief.trim().length > 0, style);
  const go = useCallback(() => {
    if (reason || working) return;
    void start({
      profileId: style.status === "ready" && style.id ? style.id : undefined,
      brief: brief.trim(),
      images: photos.map((photo) => photo.url),
      offer: cleanOffer(offer),
    });
  }, [reason, working, start, style, brief, photos, offer]);

  const begin = () => { if (consented) void listen.start(); else setArmed(true); };
  const agree = () => { rememberConsent(); setConsented(true); setArmed(false); void listen.start(); };

  return <>
    {ready && show
      ? <LivePanel key={show.id} show={show} listen={listen} size={size} onSize={chooseSize} onNew={reset} />
      : <>
          <PhotoComposer photos={photos} onPhotos={setPhotos} brief={brief} onBrief={setBrief} disabled={working} />
          <section className="vs-card" aria-label={t("ตั้งค่า")}>
            <div className="vs-row">
              <span className="vs-label">{t("สไตล์การพูด")}</span>
              <StyleSection onState={setStyle} disabled={working} allowNone rememberKey={PROFILE_KEY} />
            </div>
            <details className="vs-more ls-offer">
              <summary>{t("ราคาและโปรโมชัน")}<span className="vs-more-count">{t("ไม่บังคับ")}</span></summary>
              <div className="ls-offer-fields">
                {OFFER_FIELDS.map((field) => <div className="vs-field" key={field.key}>
                  <label htmlFor={`ls-offer-${field.key}`}>{t(field.label)}</label>
                  <input id={`ls-offer-${field.key}`} maxLength={200} value={offer[field.key] ?? ""} disabled={working} placeholder={t(field.placeholder)}
                    onChange={(event) => setOffer((current) => ({ ...current, [field.key]: event.target.value }))} />
                </div>)}
              </div>
            </details>
          </section>
        </>}
    {children}
    {ready
      ? <ListenBar listen={listen} armed={armed} onStart={begin} onAgree={agree} onCancel={() => setArmed(false)} />
      : <PrepareBar show={show} starting={starting} problem={problem} reason={reason} onStart={go} />}
  </>;
}
