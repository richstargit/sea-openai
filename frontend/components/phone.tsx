"use client";

import { useLanguage } from "@/components/language-provider";

import { cn } from "@/lib/utils";

/**
 * A 9:16 phone. The screen is a size container, so everything inside can be
 * sized in `cqw` and scales with the device instead of with the viewport.
 */
export function Phone({
  children,
  className,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={cn(
        "relative aspect-[9/19] w-full rounded-[13%/6.2%] bg-[#0d0d0f] p-[2.6%] shadow-[0_0_0_1.5px_#3a3a3d_inset,0_30px_60px_-20px_rgb(0_0_0/0.45),0_10px_24px_-12px_rgb(0_0_0/0.35)]",
        className,
      )}
    >
      <div
        className="@container relative h-full w-full overflow-hidden rounded-[10.6%/5%] bg-black"
        role={label ? "img" : undefined}
        aria-label={t(label)}
      >
        {t(children)}
        <div
          aria-hidden
          className="absolute top-[1.6%] left-1/2 z-30 h-[2.6%] w-[28%] -translate-x-1/2 rounded-full bg-black"
        />
      </div>
    </div>
  );
}
