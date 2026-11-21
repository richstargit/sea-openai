import { requireAccount } from "@/lib/require-account";
import { backendOrigin } from "@/lib/backend";
import { StudioShell } from "./studio-shell";
import { VideoStudio } from "./video/video-studio";
import { LivePage } from "./live-script/live-page";

export async function AccountWorkspace({ live = false }: { live?: boolean }) {
  const user = await requireAccount();
  return <StudioShell live={live}>
    {live
      ? <LivePage key={user.id} overlayOrigin={process.env.OVERLAY_PUBLIC_ORIGIN || backendOrigin} />
      : <VideoStudio key={user.id} />}
  </StudioShell>;
}
