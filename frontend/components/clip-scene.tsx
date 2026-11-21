"use client";

import { useLanguage } from "@/components/language-provider";

import { cn } from "@/lib/utils";
import { ProductArt } from "@/components/product-art";
import type { ProductTheme } from "@/lib/demo-data";

/**
 * One frame of a generated clip, laid out the way the real render would be:
 * hook on top, lit product in the middle, subtitle, then price and CTA.
 * Sized in cqw so it scales with whichever Phone it sits in.
 */
export function ClipScene({
  product,
  hook,
  caption,
  price = true,
  image,
  children,
  className,
}: {
  product: ProductTheme;
  hook?: string;
  caption?: string;
  price?: boolean;
  /** The seller's own photo. Falls back to the illustrated stand-in. */
  image?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", className)}
      style={{ background: product.bg, color: product.fg }}
    >
      {/* studio light behind the product */}
      <div
        aria-hidden
        className="absolute left-1/2 top-[47%] size-[120cqw] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: `radial-gradient(closest-side, ${product.light}, transparent)`,
        }}
      />

      {/* story-style progress: hook / selling point / price */}
      <div aria-hidden className="absolute inset-x-[6cqw] top-[12.5cqw] z-10 flex gap-[1.6cqw]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-[0.9cqw] flex-1 overflow-hidden rounded-full"
            style={{ background: "color-mix(in oklab, currentColor 25%, transparent)" }}
          >
            {i === 0 && (
              <span
                className="block h-full w-full origin-left rounded-full"
                style={{ background: "currentColor", animation: "scene-fill 6s linear infinite" }}
              />
            )}
            {i === 1 && <span className="block h-full w-full rounded-full" style={{ background: "currentColor", opacity: 0.0 }} />}
          </span>
        ))}
      </div>

      {hook && (
        <p
          className="absolute inset-x-[8cqw] top-[20cqw] z-10 text-[8.4cqw] leading-[1.22] font-bold tracking-[-0.02em] text-balance"
        >
          {t(hook)}
        </p>
      )}

      <div
        className="absolute left-1/2 top-[47%] w-[56cqw] -translate-x-1/2 -translate-y-1/2"
        style={{ animation: "slow-drift 7s ease-in-out infinite" }}
      >
        {t(image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="aspect-square w-full rounded-[4cqw] object-cover shadow-[0_18px_30px_rgb(0_0_0/0.35)]"
          />
        ) : (
          <ProductArt kind={product.kind} className="h-auto w-full drop-shadow-[0_18px_22px_rgb(0_0_0/0.25)]" />
        ))}
      </div>

      {caption && (
        <p className="absolute inset-x-[10cqw] bottom-[27cqw] z-10 mx-auto w-fit max-w-full rounded-[2.4cqw] bg-black/70 px-[3.2cqw] py-[1.6cqw] text-center text-[4.4cqw] leading-[1.4] font-medium text-white">
          {t(caption)}
        </p>
      )}

      {price && (
        <div className="absolute inset-x-[6cqw] bottom-[7cqw] z-10 flex items-center justify-between gap-[3cqw]">
          <span className="rounded-full bg-brand px-[4.4cqw] py-[1.6cqw] text-[6.2cqw] leading-[1.3] font-bold text-brand-ink">
            {t(product.price)}
          </span>
          <span className="text-right text-[4.2cqw] leading-[1.35] font-semibold">
            {t(product.cta)}
          </span>
        </div>
      )}

      {t(children)}
    </div>
  );
}
