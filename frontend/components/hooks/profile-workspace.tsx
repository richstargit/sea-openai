"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, useLive } from "@/lib/hooks/api";
import { ErrorNote, PageTitle, Shell } from "./bits";
import { CreateTab } from "./create-tab";
import { SourcesTab } from "./sources-tab";
import { StyleTab } from "./style-tab";

export function ProfileWorkspace({ id }: { id: string }) {
  const { data: profile, error, refresh, setData } = useLive(useCallback(() => api.profile(id), [id]));
  const [tab, setTab] = useState("sources");
  const last = useRef<string | null>(null);

  // Land on the result when a run finishes, and on first load of a finished profile.
  useEffect(() => {
    if (!profile) return;
    const finished = last.current === "running" && profile.status === "ready";
    if (finished || (last.current === null && profile.status === "ready")) setTab("style");
    last.current = profile.status;
  }, [profile]);

  if (error && !profile) return <Shell><ErrorNote>{error}</ErrorNote></Shell>;
  if (!profile) {
    return (
      <Shell>
        <Skeleton className="h-12 w-72 rounded-xl" />
        <Skeleton className="mt-8 h-11 w-96 rounded-full" />
        <Skeleton className="mt-6 h-64 rounded-3xl" />
      </Shell>
    );
  }

  return (
    <Shell>
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/hooks"><ArrowLeft /> โปรไฟล์ทั้งหมด</Link>
      </Button>
      <div className="mt-3">
        <PageTitle title={profile.name}>
          {profile.mock ? <Badge variant="wash">โหมดเดโม</Badge> : null}
        </PageTitle>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-8 gap-6">
        <TabsList>
          <TabsTrigger value="sources">คลิปอ้างอิง</TabsTrigger>
          <TabsTrigger value="style" disabled={!profile.insights}>สไตล์</TabsTrigger>
          <TabsTrigger value="create" disabled={profile.status !== "ready"}>สร้างสคริปต์</TabsTrigger>
        </TabsList>
        <TabsContent value="sources">
          <SourcesTab profile={profile} onChange={setData} refresh={refresh} />
        </TabsContent>
        <TabsContent value="style">
          {profile.insights ? <StyleTab profile={profile} onCreate={() => setTab("create")} /> : null}
        </TabsContent>
        <TabsContent value="create">
          <CreateTab profile={profile} />
        </TabsContent>
      </Tabs>
    </Shell>
  );
}
