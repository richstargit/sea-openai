import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileWorkspace } from "@/components/hooks/profile-workspace";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = { title: "โปรไฟล์สไตล์ | SnapPromo" };

async function Workspace({ params }: PageProps<"/hooks/[id]">) {
  const { id } = await params;
  return <ProfileWorkspace id={id} />;
}

export default function ProfilePage(props: PageProps<"/hooks/[id]">) {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex-1">
        <Suspense fallback={<p className="p-10 text-muted-foreground">กำลังโหลด</p>}>
          <Workspace {...props} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
