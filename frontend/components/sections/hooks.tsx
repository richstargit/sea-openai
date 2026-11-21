"use client";

import { useLanguage } from "@/components/language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone } from "@/components/phone";
import { ClipScene } from "@/components/clip-scene";
import { hooks, products } from "@/lib/demo-data";
import { nearest, project, spring, springBouncy, fade } from "@/lib/spring";

/**
 * A rail you can throw. Dragging is 1:1 with the finger; on release we project
 * where the flick is heading, snap to the nearest card to *that*, and hand the
 * release velocity to the spring so there is no seam between drag and settle.
 * Past the ends the rail resists (drag elastic) instead of stopping dead.
 */
export function Hooks() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLUListElement>(null);
  const x = useMotionValue(0);
  const [active, setActive] = useState(0);
  const [bounds, setBounds] = useState({ min: 0, snaps: [0] });

  const measure = useCallback(() => {
    const v = viewport.current;
    const r = rail.current;
    if (!v || !r) return;
    // The viewport has side padding so cards can bleed to the screen edge.
    const cs = getComputedStyle(v);
    const inner = v.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const min = -Math.max(0, r.scrollWidth - inner);
    // Rect differences are independent of the current drag transform.
    const left = r.getBoundingClientRect().left;
    const snaps = Array.from(r.children).map((c) =>
      Math.max(min, Math.min(0, -(c.getBoundingClientRect().left - left))),
    );
    setBounds({ min, snaps });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (viewport.current) ro.observe(viewport.current);
    return () => ro.disconnect();
  }, [measure]);

  const settle = useCallback(
    (target: number, velocity = 0) => {
      // animate from the live on-screen value, never from a logical target
      animate(
        x,
        target,
        reduce ? fade : { ...(Math.abs(velocity) > 300 ? springBouncy : spring), velocity },
      );
      setActive(bounds.snaps.indexOf(target));
    },
    [bounds.snaps, reduce, x],
  );

  const onDragEnd = (_: PointerEvent, info: PanInfo) => {
    const projected = x.get() + project(info.velocity.x);
    settle(nearest(bounds.snaps, projected), info.velocity.x);
  };

  const go = (i: number) => {
    const clamped = Math.max(0, Math.min(hooks.length - 1, i));
    settle(bounds.snaps[clamped]);
  };

  const canDrag = bounds.min < 0;

  return (
    <section id="hooks" className="scroll-mt-12 bg-surface">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[44rem]">
            <h2 className="t-h2">{t("หนึ่งสินค้า สามเวอร์ชัน")}</h2>
            <p className="t-lead mt-5 text-muted-foreground">
              {t(" เปิดคลิปด้วยประโยคต่างกัน แล้วโพสต์ทดลองบนแพลตฟอร์มเพื่อดูว่าแบบไหนหยุดนิ้วคนได้ ")}</p>
          </div>
          {canDrag && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                aria-label={t("เวอร์ชันก่อนหน้า")}
                disabled={active === 0}
                onClick={() => go(active - 1)}
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                aria-label={t("เวอร์ชันถัดไป")}
                disabled={active === hooks.length - 1}
                onClick={() => go(active + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>

        <div ref={viewport} className="-mx-4 mt-4 overflow-hidden px-4 py-8 sm:-mx-6 sm:px-6">
          <motion.ul
            ref={rail}
            style={{ x, touchAction: "pan-y" }}
            drag={canDrag ? "x" : false}
            dragConstraints={{ left: bounds.min, right: 0 }}
            dragElastic={0.18}
            dragMomentum={false}
            onDragEnd={onDragEnd}
            className="flex cursor-grab gap-6 active:cursor-grabbing"
          >
            {hooks.map((h) => (
              <li key={h.id} className="w-[min(300px,74vw)] shrink-0 select-none">
                <Phone label={t("เวอร์ชัน ") + (h.id) + ": " + (t(h.line))}>
                  <ClipScene
                    product={products.food}
                    hook={t(t(h.line))}
                    caption={t(h.angle)}
                    price={false}
                  />
                </Phone>
                <div className="mt-5 px-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{t("เวอร์ชัน ")}{t(h.id)}</Badge>
                    <span className="font-semibold">{t(h.angle)}</span>
                  </div>
                  <p className="t-small mt-2 text-muted-foreground">{t(h.note)}</p>
                </div>
              </li>
            ))}
          </motion.ul>
        </div>

        <p className="t-small mt-10 text-muted-foreground">
          {t(" ส่งออกได้ทั้งสามเวอร์ชันในครั้งเดียว ใช้กับ TikTok Shop, Shopee, LINE และ Facebook ")}</p>
      </div>
    </section>
  );
}
