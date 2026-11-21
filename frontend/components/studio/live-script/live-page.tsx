"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { ObsPanel, useObs } from "../live-controls";
import { PriceTag } from "../live/price-tag";
import "../video/video.css";
import "./live-script.css";
import { LiveScriptStudio } from "./live-studio";

/**
 * The live studio, top to bottom: what the page is for, whether OBS is connected (a slim row that opens into the
 * links), the price tag the seller needs at hand in every phase, the live script, then the floating bar.
 */
export function LivePage({ overlayOrigin }: { overlayOrigin: string }) {
  const { t } = useLanguage();
  const obs = useObs();
  const [prompterUrl, setPrompterUrl] = useState<string | null>(null);

  return <div className="vs ls">
    <div className="studio-intro vs-intro"><h1>{t("วันนี้ไลฟ์ขายอะไร?")}</h1></div>
    <ObsPanel obs={obs} overlayOrigin={overlayOrigin} prompterUrl={prompterUrl} />
    <PriceTag obs={obs} />
    <LiveScriptStudio onPrompterUrl={setPrompterUrl} />
  </div>;
}
