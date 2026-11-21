"use client";

import { useLanguage } from "@/components/language-provider";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, RotateCcw, SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Phone } from "@/components/phone";
import { ClipScene } from "@/components/clip-scene";
import {
  audienceScript,
  classify,
  intentMeta,
  products,
  sampleComments,
  type Intent,
} from "@/lib/demo-data";
import { fade, spring, springBouncy } from "@/lib/spring";

type Comment = { id: number; user: string; text: string; intent: Intent | null };
type QCard = Comment & { intent: Intent; state: "open" | "used" | "skipped" };
type Overlay = Intent | "promo" | "gift";

const intents = Object.keys(intentMeta) as Intent[];
const zeroCounts = (): Record<Intent, number> => ({
  price: 0,
  shipping: 0,
  ingredient: 0,
  size: 0,
  stock: 0,
});

const food = products.food;

export function LiveDemo() {
  const { t } = useLanguage();
  const reduce = useReducedMotion();
  const nextId = useRef(1);
  const [comments, setComments] = useState<Comment[]>([]);
  const [cards, setCards] = useState<QCard[]>([]);
  const [counts, setCounts] = useState(zeroCounts);
  const countsRef = useRef(counts);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [draft, setDraft] = useState("");
  const [auto, setAuto] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const scriptIndex = useRef(0);

  const showOverlay = useCallback((o: Overlay) => {
    setOverlays((prev) => (prev.includes(o) ? prev : [...prev, o]));
  }, []);

  const submit = useCallback(
    (text: string, user = "คุณ") => {
      const clean = text.trim();
      if (!clean) return;
      const intent = classify(clean);
      const comment: Comment = { id: nextId.current++, user, text: clean, intent };
      setQuiet(false);
      setComments((prev) => [...prev.slice(-3), comment]);
      if (!intent) return;

      const card: QCard = { ...comment, intent, state: "open" };
      setCards((prev) => [card, ...prev].slice(0, 12));
      const n = countsRef.current[intent] + 1;
      countsRef.current = { ...countsRef.current, [intent]: n };
      setCounts(countsRef.current);
      if (n >= intentMeta[intent].threshold) showOverlay(intent);
    },
    [showOverlay],
  );

  // Scripted audience: a customer types in every couple of seconds.
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      const line = audienceScript[scriptIndex.current];
      if (!line) {
        setAuto(false);
        return;
      }
      scriptIndex.current += 1;
      submit(line.text, line.user);
    }, 2200);
    return () => clearInterval(t);
  }, [auto, submit]);

  // Sales rhythm: when comments stop for a while, suggest a sweetener.
  useEffect(() => {
    if (comments.length < 3 || auto) return;
    const t = setTimeout(() => setQuiet(true), 9000);
    return () => clearTimeout(t);
  }, [comments, auto]);

  const totalQuestions = intents.reduce((s, i) => s + counts[i], 0);
  const hotNudge = totalQuestions >= 6 && !overlays.includes("promo");
  const quietNudge = quiet && !overlays.includes("gift");

  const reset = () => {
    setComments([]);
    setCards([]);
    countsRef.current = zeroCounts();
    setCounts(countsRef.current);
    setOverlays([]);
    setAuto(false);
    setQuiet(false);
    scriptIndex.current = 0;
  };

  const markCard = (id: number, state: QCard["state"]) =>
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, state } : c)));

  const pop = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: fade }
    : {
        initial: { opacity: 0, scale: 0.6, y: 16 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.9 },
        transition: springBouncy,
      };

  return (
    <section id="live" className="dark scroll-mt-12 bg-background text-foreground">
      <div className="mx-auto max-w-[1080px] px-4 py-24 sm:px-6 sm:py-36">
        <div className="max-w-[44rem]">
          <h2 className="t-h2">{t("ลูกมือ AI ตอนไลฟ์")}</h2>
          <p className="t-lead mt-5 text-muted-foreground">
            {t(" แม่ค้าต้องพูด ตอบคอมเมนต์ กดสินค้า และดูยอดพร้อมกัน ลูกมือคัดคำถามที่ควรตอบ แล้วขึ้นกราฟิกบนจอไลฟ์ให้เอง ลองพิมพ์คอมเมนต์ดู ")}</p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-14">
          {/* ---------- Left: the live screen + the viewer's keyboard ---------- */}
          <div className="mx-auto w-full max-w-[320px]">
            <Phone label={t("หน้าจอไลฟ์ที่มีกราฟิกขึ้นเอง")}>
              <ClipScene product={food} price={false}>
                {/* live chip */}
                <span className="absolute top-[18.5cqw] left-[6cqw] z-20 inline-flex items-center gap-[1.6cqw] rounded-full bg-black/65 px-[3cqw] py-[1.2cqw] text-[3.6cqw] font-semibold text-white">
                  <span aria-hidden className="size-[2.2cqw] rounded-full bg-[#ff3b30]" />
                  LIVE
                </span>

                <div className="absolute inset-x-[6cqw] top-[29cqw] z-20 flex flex-col gap-[2cqw]">
                  <AnimatePresence>
                    {overlays.includes("shipping") && (
                      <motion.div key="shipping" {...pop} className="rounded-[2.4cqw] bg-white px-[3.4cqw] py-[1.8cqw] text-[4.2cqw] leading-[1.35] font-semibold text-black">
                        {t(" ส่งฟรีเมื่อซื้อครบ ฿299 ")}</motion.div>
                    )}
                    {overlays.includes("promo") && (
                      <motion.div key="promo" {...pop} className="rounded-[2.4cqw] bg-brand px-[3.4cqw] py-[1.8cqw] text-[4.2cqw] leading-[1.35] font-bold text-brand-ink">
                        {t(" โปรไลฟ์ ซื้อ 2 ขวด ฿159 ")}</motion.div>
                    )}
                    {overlays.includes("gift") && (
                      <motion.div key="gift" {...pop} className="rounded-[2.4cqw] bg-white px-[3.4cqw] py-[1.8cqw] text-[4.2cqw] leading-[1.35] font-semibold text-black">
                        {t(" แถมซองน้ำพริกทดลอง 1 ซอง ")}</motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* price sticker: pops when price is asked 3 times */}
                <AnimatePresence>
                  {overlays.includes("price") && (
                    <motion.div
                      key="price"
                      {...pop}
                      className="absolute top-[56cqw] right-[5cqw] z-20 rounded-[4cqw] bg-brand px-[4.6cqw] py-[2.4cqw] text-center text-brand-ink shadow-[0_8px_20px_rgb(0_0_0/0.35)]"
                    >
                      <span className="block text-[3.4cqw] leading-[1.3] font-medium">{t("ขวดละ")}</span>
                      <span className="block text-[10cqw] leading-[1.1] font-extrabold tabular-nums">
                        {t(food.price)}
                      </span>
                    </motion.div>
                  )}
                  {overlays.includes("ingredient") && (
                    <motion.ul
                      key="ingredient"
                      {...pop}
                      className="absolute top-[58cqw] left-[5cqw] z-20 flex flex-col gap-[1.4cqw]"
                      aria-label={t("ส่วนผสม")}
                    >
                      {["พริกแห้ง", "กระเทียม", "หอมแดง", "น้ำตาลมะพร้าว"].map((i) => (
                        <li key={i} className="w-fit rounded-full bg-white/92 px-[3cqw] py-[1.1cqw] text-[3.6cqw] leading-[1.35] font-medium text-black">
                          {t(i)}
                        </li>
                      ))}
                    </motion.ul>
                  )}
                  {overlays.includes("size") && (
                    <motion.div key="size" {...pop} className="absolute top-[82cqw] right-[5cqw] z-20 rounded-full bg-white/92 px-[3.4cqw] py-[1.2cqw] text-[3.8cqw] font-semibold text-black">
                      {t(" 200 กรัม ")}</motion.div>
                  )}
                  {overlays.includes("stock") && (
                    <motion.div key="stock" {...pop} className="absolute top-[94cqw] right-[5cqw] z-20 rounded-full bg-black/80 px-[3.4cqw] py-[1.2cqw] text-[3.8cqw] font-semibold text-white">
                      {t(" พร้อมส่ง ")}</motion.div>
                  )}
                </AnimatePresence>

                {/* chat */}
                <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 to-transparent px-[5cqw] pt-[14cqw] pb-[6cqw]">
                  <ul className="flex min-h-[26cqw] flex-col justify-end gap-[1.4cqw]" aria-hidden>
                    <AnimatePresence initial={false}>
                      {comments.map((c) => (
                        <motion.li
                          key={c.id}
                          layout={!reduce}
                          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={reduce ? fade : spring}
                          className="w-fit max-w-full text-[3.8cqw] leading-[1.4] text-white"
                        >
                          <span className="font-semibold opacity-75">{t(c.user)} </span>
                          {t(c.text)}
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              </ClipScene>
            </Phone>

            <form
              className="mt-6"
              onSubmit={(e) => {
                e.preventDefault();
                submit(draft);
                setDraft("");
              }}
            >
              <label htmlFor="live-comment" className="t-small mb-2 block text-muted-foreground">
                {t(" พิมพ์เป็นลูกค้า ")}</label>
              <div className="flex gap-2">
                <Input
                  id="live-comment"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={t("เช่น ราคาเท่าไหร่คะ")}
                  autoComplete="off"
                  enterKeyHint="send"
                  className="h-12 rounded-full bg-secondary px-5 text-[1.0625rem] md:text-[1.0625rem] border-transparent"
                />
                <Button type="submit" size="icon" aria-label={t("ส่งคอมเมนต์")} disabled={!draft.trim()}>
                  <SendHorizontal />
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {sampleComments.map((s) => (
                  <Button key={s} type="button" variant="secondary" size="sm" onClick={() => submit(s)}>
                    {t(s)}
                  </Button>
                ))}
              </div>
            </form>
          </div>

          {/* ---------- Right: the seller's side ---------- */}
          <div className="flex min-w-0 flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="t-h3">{t("หน้าจอแม่ค้า")}</h3>
              <div className="flex items-center gap-5">
                <label className="flex min-h-11 items-center gap-3 text-[0.9375rem]">
                  <Switch
                    checked={auto}
                    onCheckedChange={(v) => {
                      if (v && scriptIndex.current >= audienceScript.length) reset();
                      setAuto(v);
                    }}
                  />
                  {t(" ลูกค้าจำลองพิมพ์เข้ามา ")}</label>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw /> {t(" เริ่มใหม่ ")}</Button>
              </div>
            </div>

            {/* signal meters */}
            <div className="rounded-3xl bg-surface p-5 sm:p-6">
              <p className="text-[0.9375rem] font-semibold">{t("สัญญาณคำถาม")}</p>
              <p className="t-small text-muted-foreground">
                {t(" ถามซ้ำถึงเกณฑ์เมื่อไหร่ กราฟิกจะขึ้นบนจอไลฟ์เมื่อนั้น ")}</p>
              <ul className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
                {intents.map((i) => {
                  const m = intentMeta[i];
                  const n = Math.min(counts[i], m.threshold);
                  const done = counts[i] >= m.threshold;
                  return (
                    <li key={i} className="flex items-center justify-between gap-3">
                      <span className="text-[0.9375rem]">{t(m.label)}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className="flex gap-1"
                          role="img"
                          aria-label={(counts[i]) + t(" จาก ") + (m.threshold)}
                        >
                          {Array.from({ length: m.threshold }).map((_, k) => (
                            <span
                              key={k}
                              className={`h-2 w-5 rounded-full transition-colors duration-200 ${
                                k < n ? "bg-brand" : "bg-foreground/15"
                              }`}
                            />
                          ))}
                        </span>
                        <span className="grid size-5 place-items-center">
                          {done && <Check className="size-4 text-brand-text" strokeWidth={3} aria-label={t("ขึ้นกราฟิกแล้ว")} />}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* nudges */}
            <AnimatePresence>
              {(hotNudge || quietNudge) && (
                <motion.div
                  key={hotNudge ? "hot" : "quiet"}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={reduce ? fade : spring}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-brand p-5 text-brand-ink"
                  role="status"
                >
                  <div>
                    <p className="text-[1.0625rem] leading-snug font-bold">
                      {t(hotNudge ? "คนถามเยอะแล้ว ตอนนี้ปล่อยโปรเลย" : "คนเริ่มเงียบ ลองเปิดของแถม")}
                    </p>
                    <p className="t-small opacity-80">
                      {t(hotNudge ? `ถามมาแล้ว ${totalQuestions} คำถาม` : "ไม่มีคอมเมนต์ใหม่สักพัก")}
                    </p>
                  </div>
                  <Button
                    variant="dark"
                    onClick={() => {
                      showOverlay(hotNudge ? "promo" : "gift");
                      if (!hotNudge) setQuiet(false);
                    }}
                  >
                    {t(hotNudge ? "ขึ้นป้ายโปร" : "ขึ้นป้ายของแถม")}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* question queue */}
            <div aria-live="polite" className="flex flex-col gap-3">
              {cards.length === 0 && (
                <div className="rounded-3xl border border-dashed border-border p-8 text-center text-muted-foreground">
                  {t(" ยังไม่มีคำถาม ลองพิมพ์ “ราคาเท่าไหร่คะ” ที่ช่องด้านซ้าย ")}</div>
              )}
              <AnimatePresence initial={false}>
                {cards.map((c) => {
                  const m = intentMeta[c.intent];
                  return (
                    <motion.article
                      key={c.id}
                      layout={!reduce}
                      initial={{ opacity: 0, y: reduce ? 0 : -16 }}
                      animate={{ opacity: c.state === "open" ? 1 : 0.55, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={reduce ? fade : spring}
                      className="rounded-3xl bg-surface p-5"
                    >
                      <div className="flex items-center gap-3">
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-[0.9375rem] font-semibold">
                          {t(c.user).slice(0, 1)}
                        </span>
                        <p className="min-w-0 flex-1 font-medium">
                          <span className="text-muted-foreground">{t(c.user)} </span>
                          {t(c.text)}
                        </p>
                        <Badge variant="wash">{t(m.label)}</Badge>
                      </div>
                      <div className="mt-3 rounded-2xl bg-surface-2 p-3.5">
                        <p className="t-small text-muted-foreground">{t("คำตอบที่แนะนำ")}</p>
                        <p className="mt-0.5">{t(m.answer)}</p>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        {t(c.state === "open" ? (
                          <>
                            <Button size="sm" onClick={() => markCard(c.id, "used")}>
                              {t(" ใช้คำตอบนี้ ")}</Button>
                            <Button size="sm" variant="ghost" onClick={() => markCard(c.id, "skipped")}>
                              {t(" ข้าม ")}</Button>
                          </>
                        ) : (
                          <span className="t-small flex items-center gap-1.5 text-muted-foreground">
                            {c.state === "used" && <Check className="size-4" aria-hidden />}
                            {t(c.state === "used" ? "ตอบแล้ว" : "ข้ามแล้ว")}
                          </span>
                        ))}
                      </div>
                    </motion.article>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <p className="t-small mt-12 text-muted-foreground">
          {t(" เดโมจำลอง ไม่ได้เชื่อมแพลตฟอร์มไลฟ์จริง คอมเมนต์ที่คุณพิมพ์และสคริปต์ลูกค้าจำลองถูกคัดด้วยกฎคำสำคัญในเบราว์เซอร์นี้เท่านั้น ")}</p>
      </div>
    </section>
  );
}
