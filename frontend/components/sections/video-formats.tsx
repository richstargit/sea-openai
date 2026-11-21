"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import { VideoFormatPicker } from "@/components/video-format-picker";
import { VideoPreview } from "@/components/video-preview";
import { products } from "@/lib/demo-data";
import { videoFormats, type VideoSize } from "@/lib/video-formats";

export function VideoFormats() {
  const { t } = useLanguage();
  const [size, setSize] = useState<VideoSize>(videoFormats[0]);
  return (
    <section id="video-formats" aria-labelledby="video-formats-title" className="scroll-mt-24 bg-surface">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <h2 id="video-formats-title" className="t-h2 max-w-[44rem]">{t("ทุกสัดส่วน สำหรับช่องทางของร้าน")}</h2>
        <p className="t-lead mt-5 max-w-[44rem] text-muted-foreground">{t("แนวนอนสำหรับ YouTube แนวตั้งสำหรับ Shorts และ Reels หรือจัตุรัสและฟีดสำหรับ Instagram กับ Facebook เลือกพรีเซ็ตหรือกำหนดความกว้างและความสูงเองได้")}</p>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-2">
          <VideoFormatPicker value={size} onChange={setSize} />
          <figure className="min-w-0 rounded-3xl bg-background p-4 sm:p-6">
            <div className="flex min-h-[420px] items-center justify-center">
              <VideoPreview size={size} product={products.food} hook={products.food.hook} caption={products.food.selling} />
            </div>
            <figcaption className="mt-5 text-center text-sm text-muted-foreground">{t("พรีวิวการจัดวางตามสัดส่วนที่เลือก")}</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
