"use client";

import { useLanguage } from "@/components/language-provider";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Phone } from "@/components/phone";
import { ClipScene } from "@/components/clip-scene";
import { productList, products, type ProductKind } from "@/lib/demo-data";
import { spring, fade } from "@/lib/spring";

export function Products() {
  const { t } = useLanguage();
  const [kind, setKind] = useState<ProductKind>("food");
  const reduce = useReducedMotion();

  return (
    <section id="products" className="dark scroll-mt-12 bg-background text-foreground">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <div className="max-w-[44rem]">
          <h2 className="t-h2">{t("ทุกสินค้า ได้ฉากของตัวเอง")}</h2>
          <p className="t-lead mt-5 text-muted-foreground">
            {t(" น้ำพริกต้องดูร้อนและหอม ซีรั่มต้องดูสะอาดและเชื่อถือได้ งานสานต้องเล่าเรื่องมือที่ทำ Codex จึงเขียนฉากใหม่ให้ทุกชิ้น ")}</p>
        </div>

        <Tabs
          value={kind}
          onValueChange={(v) => setKind(v as ProductKind)}
          className="mt-12"
        >
          <TabsList aria-label={t("ประเภทสินค้า")} className="w-full sm:w-fit">
            {productList.map((p) => (
              <TabsTrigger key={p.kind} value={p.kind}>
                {t(p.tab)}
              </TabsTrigger>
            ))}
          </TabsList>

          {productList.map((p) => (
            <TabsContent key={p.kind} value={p.kind} className="mt-8">
              <div className="grid items-center gap-10 md:grid-cols-[minmax(0,300px)_1fr] md:gap-16">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={p.kind}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={reduce ? fade : spring}
                    className="mx-auto w-[min(300px,72vw)]"
                  >
                    <Phone label={t("ตัวอย่างคลิป ") + (p.name)}>
                      <ClipScene product={p} hook={t(p.hook)} caption={t(p.selling)} />
                    </Phone>
                  </motion.div>
                </AnimatePresence>

                <div>
                  <h3 className="t-h3">{t(p.name)}</h3>
                  <p className="mt-4 text-muted-foreground">{t(p.scene)}</p>

                  <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
                    <div>
                      <dt className="t-small text-muted-foreground">{t("จังหวะ motion")}</dt>
                      <dd className="mt-1 font-medium">{t(p.motion)}</dd>
                    </div>
                    <div>
                      <dt className="t-small text-muted-foreground">{t("สีที่ระบบเลือก")}</dt>
                      <dd className="mt-2 flex gap-1.5">
                        {p.palette.map((c) => (
                          <span
                            key={c}
                            title={t(c)}
                            className="size-7 rounded-full ring-1 ring-white/25"
                            style={{ background: c }}
                          />
                        ))}
                      </dd>
                    </div>
                  </dl>

                  <div className="mt-8">
                    <p className="t-small text-muted-foreground">{t("AI อ่านจากรูป")}</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {p.seen.map((s) => (
                        <li key={s.label}>
                          <Badge variant="secondary" className="h-8 px-3.5 text-[0.875rem]">
                            {t(s.value)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <p className="t-small mt-12 text-muted-foreground">
          {t(" สินค้าและข้อความในตัวอย่างเป็นข้อมูลจำลอง (")}{t(products.food.name)}, {t(products.cosmetic.name)},{t(" ")}
          {t(products.craft.name)})
        </p>
      </div>
    </section>
  );
}
