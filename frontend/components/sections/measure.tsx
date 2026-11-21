"use client";

import { useLanguage } from "@/components/language-provider";

import { Badge } from "@/components/ui/badge";

const rows = [
  { label: "เวลาต่อคลิป", unit: "นาที" },
  { label: "ต้นทุนต่อคลิป", unit: "บาท" },
];

/*
 * Deliberately empty. These are filled with numbers measured at the hackathon,
 * not with estimates, so the page shows a dash until then.
 */
function Column({ title, sub, accent }: { title: string; sub: string; accent?: boolean }) {
  const { t } = useLanguage();
  return (
    <article className={`tile p-7 sm:p-9 ${accent ? "ring-2 ring-brand" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="t-h3">{t(title)}</h3>
        <Badge variant={accent ? "wash" : "secondary"}>{t("รอวัดจริง")}</Badge>
      </div>
      <p className="t-small mt-1 text-muted-foreground">{t(sub)}</p>
      <dl className="mt-8 flex flex-col">
        {rows.map((r, i) => (
          <div
            key={r.label}
            className={`flex items-baseline justify-between gap-4 py-4 ${i ? "border-t border-border" : ""}`}
          >
            <dt className="text-muted-foreground">{t(r.label)}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="font-display text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums" aria-label={t("ยังไม่มีตัวเลข")}>
                —
              </span>
              <span className="t-small text-muted-foreground">{t(r.unit)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function Measure() {
  const { t } = useLanguage();
  return (
    <section id="measure" className="scroll-mt-12 bg-background">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <div className="max-w-[44rem]">
          <h2 className="t-h2">{t("วัดทุกคลิป เทียบกับการจ้างทำ")}</h2>
          <p className="t-lead mt-5 text-muted-foreground">
            {t(" ใน Hackathon เราจะจับเวลาและรวมค่าโมเดลของทุกคลิปที่ทำกับสินค้าจริง แล้วเทียบกับราคาจ้างช่างภาพและคนตัดต่อ ตัวเลขจะขึ้นตรงนี้เมื่อวัดแล้วเท่านั้น ")}</p>
        </div>
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <Column title="SnapPromo" sub={t("ถ่ายรูปถึงคลิปพร้อมโพสต์ รวมทุกขั้นตอน")} accent />
          <Column title={t("จ้างทำ")} sub={t("ช่างภาพ คนเขียนบท คนตัดต่อ ราคาตลาดที่สอบถามมา")} />
        </div>
      </div>
    </section>
  );
}
