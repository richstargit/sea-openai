import { Suspense } from "react";
import { AccountWorkspace } from "@/components/studio/account-workspace";

export const metadata = { title: "Live studio — SnapPromo" };

export default function LivePage() {
  return <Suspense><AccountWorkspace live /></Suspense>;
}
