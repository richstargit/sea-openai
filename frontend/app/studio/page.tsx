import { Suspense } from "react";
import { AccountWorkspace } from "@/components/studio/account-workspace";

export const metadata = { title: "Video studio — SnapPromo" };

export default function StudioPage() {
  return <Suspense><AccountWorkspace /></Suspense>;
}
