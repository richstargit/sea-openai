"use client";

import { useLanguage } from "@/components/language-provider";

import { useId } from "react";
import type { ProductKind } from "@/lib/demo-data";

/*
 * Illustrated stand-ins for the shopper's own photos. Drawn as vector with
 * cylinder shading so they read as lit objects, not flat icons.
 * viewBox 200 x 260, object centred, shadow on the floor.
 */
export function ProductArt({
  kind,
  className,
  title,
}: {
  kind: ProductKind;
  className?: string;
  title?: string;
}) {
  const { t } = useLanguage();
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 200 260"
      className={className}
      role={title ? "img" : undefined}
      aria-label={t(title)}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <filter id={`${id}-blur`} x="-30%" y="-100%" width="160%" height="300%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        {/* cylinder shading: dark edges, a soft highlight just off-centre */}
        <linearGradient id={`${id}-cyl`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0.38" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="0.0" />
          <stop offset="0.34" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.42" />
        </linearGradient>
        <linearGradient id={`${id}-paste`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c7421a" />
          <stop offset="1" stopColor="#7d1f08" />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8d8d93" />
          <stop offset="0.35" stopColor="#f1f1f4" />
          <stop offset="0.6" stopColor="#b9b9bf" />
          <stop offset="1" stopColor="#77777d" />
        </linearGradient>
        <pattern
          id={`${id}-weave`}
          width="14"
          height="14"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="14" height="14" fill="#c8924f" />
          <rect width="14" height="6.5" fill="#a9763a" />
          <rect width="6.5" height="14" fill="#b98342" opacity="0.8" />
        </pattern>
        <clipPath id={`${id}-basket`}>
          <path d="M40 112 H160 L146 214 Q100 228 54 214 Z" />
        </clipPath>
      </defs>

      {/* floor shadow */}
      <ellipse
        cx="100"
        cy="238"
        rx="64"
        ry="9"
        fill="#000"
        opacity="0.35"
        filter={`url(#${id}-blur)`}
      />

      {kind === "food" && (
        <g>
          {/* lid */}
          <rect x="50" y="26" width="100" height="34" rx="9" fill="#26211f" />
          <rect x="50" y="26" width="100" height="34" rx="9" fill={`url(#${id}-cyl)`} />
          <rect x="58" y="52" width="84" height="3" fill="#000" opacity="0.35" />
          {/* glass body */}
          <rect x="44" y="58" width="112" height="174" rx="24" fill="#f6ebe0" opacity="0.92" />
          {/* paste */}
          <rect x="49" y="82" width="102" height="145" rx="19" fill={`url(#${id}-paste)`} />
          {/* label */}
          <rect x="55" y="118" width="90" height="86" rx="8" fill="#fbf1e2" />
          <path
            d="M100 128c-9 2-14 10-11 18 3 8 10 8 12 2 2-7 5-12 12-14-3-3-8-7-13-6z"
            fill="#c7421a"
          />
          <path d="M101 127c1-4 4-6 7-6" stroke="#3b6b2e" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x="100" y="172" textAnchor="middle" fontSize="17" fontWeight="700" fill="#26211f">
            {t(" น้ำพริกเผา ")}</text>
          <text x="100" y="192" textAnchor="middle" fontSize="11" fill="#6b5546">
            {t(" 200 กรัม ")}</text>
          <rect x="44" y="58" width="112" height="174" rx="24" fill={`url(#${id}-cyl)`} />
        </g>
      )}

      {kind === "cosmetic" && (
        <g>
          {/* dropper bulb */}
          <rect x="82" y="26" width="36" height="54" rx="17" fill="#1b1b1d" />
          <rect x="82" y="26" width="36" height="54" rx="17" fill={`url(#${id}-cyl)`} />
          {/* collar */}
          <rect x="72" y="76" width="56" height="26" rx="5" fill={`url(#${id}-metal)`} />
          {/* bottle */}
          <rect x="58" y="98" width="84" height="134" rx="18" fill="#f3ece3" />
          <rect x="58" y="98" width="84" height="134" rx="18" fill={`url(#${id}-cyl)`} />
          {/* label */}
          <text x="100" y="156" textAnchor="middle" fontSize="15" fontWeight="700" fill="#2b1d17">
            {t(" ซีรั่ม ")}</text>
          <rect x="82" y="164" width="36" height="1.5" fill="#2b1d17" opacity="0.5" />
          <text x="100" y="182" textAnchor="middle" fontSize="9.5" fill="#6b5546">
            {t(" บำรุงผิวหน้า ")}</text>
          <text x="100" y="212" textAnchor="middle" fontSize="9" fill="#6b5546">
            30 ml
          </text>
        </g>
      )}

      {kind === "craft" && (
        <g>
          {/* handle */}
          <path
            d="M52 116 C52 40 148 40 148 116"
            fill="none"
            stroke="#8b5a2b"
            strokeWidth="9"
            strokeLinecap="round"
          />
          <path
            d="M52 116 C52 40 148 40 148 116"
            fill="none"
            stroke="#d9a86b"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="2 7"
            opacity="0.7"
          />
          {/* body */}
          <g clipPath={`url(#${id}-basket)`}>
            <rect x="30" y="100" width="140" height="140" fill={`url(#${id}-weave)`} />
            <rect x="30" y="100" width="140" height="140" fill={`url(#${id}-cyl)`} />
          </g>
          {/* rim */}
          <rect x="34" y="104" width="132" height="14" rx="7" fill="#a8733a" />
          <rect x="34" y="104" width="132" height="14" rx="7" fill={`url(#${id}-cyl)`} />
        </g>
      )}
    </svg>
  );
}
