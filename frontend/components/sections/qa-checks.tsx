"use client";

import { useLanguage } from "@/components/language-provider";

import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { spring, fade } from "@/lib/spring";

const checks = [
  "ซับไตเติลไม่ล้นกรอบ",
  "ตัวเลขราคาอ่านออก คอนทราสต์ผ่าน",
  "สินค้าไม่ถูกข้อความบัง",
  "เสียงบรรยายตรงกับซับ",
];

/** Checks tick in one after another when the tile scrolls into view. */
export function QaChecks() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.6 }}
      transition={{ staggerChildren: reduce ? 0 : 0.22 }}
      className="rounded-2xl bg-surface-2 p-4"
    >
      <ul className="flex flex-col gap-3">
        {checks.map((c) => (
          <motion.li
            key={c}
            variants={{
              hidden: { opacity: 0, y: reduce ? 0 : 8 },
              shown: { opacity: 1, y: 0 },
            }}
            transition={reduce ? fade : spring}
            className="flex items-center gap-3 text-[0.9375rem]"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand text-brand-ink">
              <Check className="size-3.5" strokeWidth={3} aria-hidden />
            </span>
            {t(c)}
          </motion.li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        <span className="t-small text-muted-foreground">{t("ผ่านครบ จึงเริ่ม render")}</span>
        <Badge variant="wash">{t("ตัวอย่างผลตรวจ")}</Badge>
      </div>
    </motion.div>
  );
}
