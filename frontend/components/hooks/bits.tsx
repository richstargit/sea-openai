"use client";

import { motion, useReducedMotion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { Children, useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Grade, Platform } from "@/lib/hooks/types";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ layout */

export function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-[1040px] px-5 pt-8 pb-32 sm:px-8 sm:pt-12", className)}>
      {children}
    </div>
  );
}

/** Large page title. The title carries the page, so nothing small sits above it. */
export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="min-w-0 font-semibold tracking-tight text-balance text-[clamp(2rem,5vw,3rem)] leading-[1.15]">{title}</h1>
      {children}
    </header>
  );
}

/** Small facts side by side, separated by space alone. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <span className={cn("flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.9375rem] text-muted-foreground", className)}>
      {items.map((item, n) => (
        <span key={typeof item === "object" && "key" in item && item.key != null ? item.key : n}>{item}</span>
      ))}
    </span>
  );
}

/** Springs, never fixed durations, and no motion at all when the user asks for none. */
export function Reveal({ children, index = 0, className }: { children: ReactNode; index?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.45, delay: Math.min(index, 6) * 0.04 }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------- bits */

const GRADE_TONE: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-brand text-brand-ink",
  C: "bg-amber-200 text-[#1d1d1f]",
  D: "bg-destructive/15 text-destructive",
  F: "bg-destructive text-white",
};

export function GradeChip({ grade, className }: { grade: Grade; className?: string }) {
  return (
    <span
      role="img"
      aria-label={`เกรด ${grade}`}
      className={cn(
        "inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full px-2 text-[0.875rem] font-bold tabular-nums",
        GRADE_TONE[grade[0] ?? "F"],
        className,
      )}
    >
      {grade}
    </span>
  );
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

export function CopyButton({ text, label = "คัดลอก", variant = "ghost" }: { text: string; label?: string; variant?: "ghost" | "secondary" }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // Clipboard can be blocked; the text stays selectable on screen.
        }
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "คัดลอกแล้ว" : label}
    </Button>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function compact(n: number | null | undefined): string {
  if (n == null) return "";
  return new Intl.NumberFormat("th-TH", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** 75 becomes 1:15, the way a video timeline reads. */
export function clock(sec: number | null | undefined): string {
  if (sec == null) return "";
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
