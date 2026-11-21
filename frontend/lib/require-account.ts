import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backendOrigin } from "@/lib/backend";

export async function requireAccount(): Promise<{ id: string; email: string }> {
  const jar = await cookies();
  const session = jar.get("__Host-so_session") ?? jar.get("so_session");
  if (!session) redirect("/login");
  const response = await fetch(`${backendOrigin}/auth/me`, {
    headers: { Cookie: `${session.name}=${session.value}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/login");
  if (!response.ok) throw new Error("Unable to load your session");

  return (await response.json()).user;
}
