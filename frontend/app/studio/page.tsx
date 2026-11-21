import type { Metadata } from "next";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Studio } from "@/components/studio/studio";

export const metadata: Metadata = {
  title: "Create your first clip — SnapPromo",
  description: "Take product photos, add your price and get three vertical clip variations.",
};

export default function StudioPage() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex-1">
        <Studio />
      </main>
      <SiteFooter />
    </>
  );
}
