"use client";

import { useLanguage } from "@/components/language-provider";

import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

// Thai has no spaces, so the phrases are split by hand at natural breaks.
const phrases: { text: string; accent?: boolean }[] = [
  { text: "ร้านเล็กไม่ได้ขาดฝีมือ" },
  { text: "แต่ไม่มีทีม" },
  { text: "ไม่มีช่างภาพ" },
  { text: "ไม่มีคนเขียนบท" },
  { text: "ไม่มีคนตัดต่อ" },
  { text: "ไม่มีนักออกแบบกราฟิก" },
  { text: "SnapPromo", accent: true },
  { text: "รวมทุกคนไว้ในมือถือเครื่องเดียว", accent: true },
];

function Phrase({
  children,
  progress,
  range,
  accent,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  accent?: boolean;
}) {
  const { t } = useLanguage();
  const opacity = useTransform(progress, range, [0.22, 1]);
  return (
    <motion.span
      style={{ opacity }}
      className={accent ? "text-brand-text" : undefined}
    >
      {t(children)}{t(" ")}
    </motion.span>
  );
}

export function Statement() {
  const { t } = useLanguage();
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.85", "end 0.55"],
  });

  return (
    <section className="dark bg-background text-foreground">
      <div className="mx-auto max-w-[1080px] px-4 py-28 sm:px-6 sm:py-44">
        <p ref={ref} className="t-h2 max-w-[18em] text-left">
          {phrases.map((p, i) =>
            reduce ? (
              <span key={p.text} className={p.accent ? "text-brand-text" : undefined}>
                {t(p.text)}{t(" ")}
              </span>
            ) : (
              <Phrase
                key={p.text}
                progress={scrollYProgress}
                range={[i / phrases.length, (i + 1) / phrases.length]}
                accent={p.accent}
              >
                {t(p.text)}
              </Phrase>
            ),
          )}
        </p>
      </div>
    </section>
  );
}
