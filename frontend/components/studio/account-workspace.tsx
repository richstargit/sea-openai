import { requireAccount } from "@/lib/require-account";
import { backendOrigin } from "@/lib/backend";
import { StudioShell } from "./studio-shell";
import { VideoWorkspace } from "./video-workspace";
import { LiveControls } from "./live-controls";

export async function AccountWorkspace({ live = false }: { live?: boolean }) {
  const user = await requireAccount();
  return <StudioShell live={live}>
    <VideoWorkspace key={user.id + String(live)} live={live} userId={user.id} />
    {live && <LiveControls overlayOrigin={process.env.OVERLAY_PUBLIC_ORIGIN || backendOrigin} />}
  </StudioShell>;
}
