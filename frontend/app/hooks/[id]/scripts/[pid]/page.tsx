import type { Metadata } from "next";
import { Suspense } from "react";
import { ScriptView } from "@/components/hooks/script-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = { title: "สคริปต์คลิป | SnapPromo" };

async function Script({ params }: PageProps<"/hooks/[id]/scripts/[pid]">) {
  const { id, pid } = await params;
  return <ScriptView profileId={id} projectId={pid} />;
}

export default function ScriptPage(props: PageProps<"/hooks/[id]/scripts/[pid]">) {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex-1">
        <Suspense fallback={<p className="p-10 text-muted-foreground">กำลังโหลด</p>}>
          <Script {...props} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
