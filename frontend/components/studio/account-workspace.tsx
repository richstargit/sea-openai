import { requireAccount } from "@/lib/require-account";
import { backendOrigin } from "@/lib/backend";
import { StudioShell } from "./studio-shell";
import { VideoWorkspace } from "./video-workspace";
import { LiveStudio } from "@/components/live/live-studio";

export async function AccountWorkspace({ live = false }: { live?: boolean }) {
  const user = await requireAccount();
  return <StudioShell live={live}>
    {live
      ? <LiveStudio userId={user.id} overlayOrigin={process.env.OVERLAY_PUBLIC_ORIGIN || backendOrigin} />
      : <VideoWorkspace key={user.id} live={false} userId={user.id} />}
  </StudioShell>;
}
