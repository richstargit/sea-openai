"use client";

import { useLanguage } from "@/components/language-provider";
import { ProductArt } from "@/components/product-art";
import type { ProductTheme } from "@/lib/demo-data";
import type { VideoSize } from "@/lib/video-formats";

export function VideoPreview({ size, product, hook, caption, image }: {
  size: VideoSize;
  product: ProductTheme;
  hook: string;
  caption: string;
  image?: string;
}) {
  const { t } = useLanguage();
  const portrait = size.width / size.height < 0.85;
  return (
    <div className="mx-auto w-full" style={{ maxWidth: Math.min(640, 420 * size.width / size.height) }}>
      <div role="img" aria-label={`${t("พรีวิววิดีโอ")} ${size.width} × ${size.height}`}
        className="@container relative isolate overflow-hidden rounded-2xl shadow-lg" style={{ aspectRatio: `${size.width} / ${size.height}`, background: product.bg, color: product.fg }}>
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse at 65% 50%, ${product.light}, transparent 75%)` }} />
        <div className={`absolute inset-[6%] flex gap-[4cqw] ${portrait ? "flex-col" : "flex-row items-center"}`}>
          <div className={`flex min-h-0 min-w-0 flex-col ${portrait ? "shrink-0 gap-[2cqw]" : "w-1/2 gap-[2cqw]"}`}>
            <p className={`${portrait ? "text-[6.5cqw]" : "text-[4.2cqw]"} font-bold leading-tight text-balance`}>{t(hook)}</p>
            {!portrait && <p className="text-[2.5cqw] leading-snug">{t(caption)}</p>}
            {!portrait && <p className="text-[2.4cqw] leading-snug font-semibold">{product.price} · {t(product.cta)}</p>}
          </div>
          <div className={`flex min-h-0 min-w-0 items-center justify-center ${portrait ? "flex-1" : "h-full w-1/2"}`}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
            ) : <ProductArt kind={product.kind} className="h-full max-h-full w-full object-contain" />}
          </div>
          {portrait && (
            <div className="shrink-0 space-y-[3cqw]">
              <p className="rounded-lg bg-black/60 px-[3cqw] py-[2cqw] text-center text-[3.7cqw] leading-snug text-white">{t(caption)}</p>
              <p className="text-[3.6cqw] leading-snug font-semibold">{product.price} · {t(product.cta)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
