"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Clapperboard, MonitorPlay, Sparkles } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { type LivePlan, type LiveProduct, catalog, defaultPlan, loadPlan, savePlan } from "@/lib/live-plan";
import { CatalogStep } from "./catalog-step";
import { SetupStep } from "./setup-step";
import { PrepareStep } from "./prepare-step";
import { ControlRoom } from "./control-room";
import "./live.css";

export type StepProps = {
  userId: string;
  plan: LivePlan;
  setPlan: (update: (plan: LivePlan) => LivePlan) => void;
  products: LiveProduct[];
  reloadProducts: () => Promise<void>;
  next: () => void;
};

const STEPS = [
  { id: "catalog", label: "คลังสินค้า", icon: Boxes },
  { id: "setup", label: "สไตล์และลำดับไลฟ์", icon: Sparkles },
  { id: "prepare", label: "เตรียมคลิปและ motion", icon: Clapperboard },
  { id: "control", label: "ห้องควบคุมไลฟ์", icon: MonitorPlay },
] as const;
type StepId = (typeof STEPS)[number]["id"];

/**
 * The live studio, step by step: add the shop's products, choose the live style and which products go on and in
 * what order, prepare dead-air clips, the motion kit and the director's script, then go live in the control room
 * (realtime detection, Decisions AI, speech, overlay into OBS).
 */
export function LiveStudio({ userId, overlayOrigin }: { userId: string; overlayOrigin: string }) {
  const { t } = useLanguage();
  const [plan, setPlanState] = useState<LivePlan>(defaultPlan);
  const [products, setProducts] = useState<LiveProduct[]>([]);
  const [step, setStep] = useState<StepId>("catalog");

  useEffect(() => { queueMicrotask(() => setPlanState(loadPlan(userId))); }, [userId]);
  const setPlan = useCallback((update: (plan: LivePlan) => LivePlan) => {
    setPlanState((current) => { const next = update(current); savePlan(userId, next); return next; });
  }, [userId]);
  const reloadProducts = useCallback(async () => { setProducts(await catalog.list().catch(() => [])); }, []);
  useEffect(() => { void reloadProducts(); }, [reloadProducts]);

  const index = STEPS.findIndex((s) => s.id === step);
  const props: StepProps = { userId, plan, setPlan, products, reloadProducts, next: () => setStep(STEPS[Math.min(STEPS.length - 1, index + 1)].id) };

  return <div className="live-studio">
    <ol className="live-steps" aria-label={t("ขั้นตอนไลฟ์")}>
      {STEPS.map((s, i) => <li key={s.id}>
        <button type="button" aria-current={s.id === step ? "step" : undefined} data-done={i < index || undefined} onClick={() => setStep(s.id)}>
          <span className="live-step-num">{i + 1}</span><s.icon size={16} aria-hidden />{t(s.label)}
        </button>
      </li>)}
    </ol>
    {step === "catalog" && <CatalogStep {...props} />}
    {step === "setup" && <SetupStep {...props} />}
    {step === "prepare" && <PrepareStep {...props} />}
    {step === "control" && <ControlRoom {...props} overlayOrigin={overlayOrigin} />}
  </div>;
}
