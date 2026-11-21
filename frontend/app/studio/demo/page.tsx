import { Suspense } from "react";
import { requireAccount } from "@/lib/require-account";
import { Studio } from "@/components/studio/studio";
import { StudioShell } from "@/components/studio/studio-shell";

async function GuidedDemo() {
  const user = await requireAccount();
  return <StudioShell live={false}><Studio userId={user.id} /></StudioShell>;
}

export default function DemoPage() {
  return <Suspense><GuidedDemo /></Suspense>;
}
