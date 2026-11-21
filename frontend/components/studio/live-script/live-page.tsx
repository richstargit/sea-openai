"use client";

import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { ObsPanel, PriceTagTest, useObs } from "../live-controls";
import { VideoWorkspace } from "../video-workspace";
import "../video/video.css";
import "./live-script.css";
import { LiveScriptStudio } from "./live-studio";

/**
 * The live studio, top to bottom: what the page is for, whether OBS is connected (a slim row that opens into the
 * links), the live script, then the on screen graphics folded away at the bottom, then the floating bar.
 */
export function LivePage({ overlayOrigin, userId }: { overlayOrigin: string; userId: string }) {
  const { t } = useLanguage();
  const obs = useObs();
  const [prompterUrl, setPrompterUrl] = useState<string | null>(null);

  return <div className="vs ls">
    <div className="studio-intro vs-intro"><h1>{t("วันนี้ไลฟ์ขายอะไร?")}</h1></div>
    <ObsPanel obs={obs} overlayOrigin={overlayOrigin} prompterUrl={prompterUrl} />
    <LiveScriptStudio onPrompterUrl={setPrompterUrl}>
      <details className="vs-more ls-gfx">
        <summary><ImagePlus size={17} aria-hidden />{t("กราฟิกบนหน้าจอ")}</summary>
        <div className="ls-gfx-body">
          <VideoWorkspace live userId={userId} />
          <PriceTagTest obs={obs} />
        </div>
      </details>
    </LiveScriptStudio>
  </div>;
}
