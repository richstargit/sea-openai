import { Suspense } from "react";
import { requireAccount } from "@/lib/require-account";
import type { Metadata } from "next";
import { Editor } from "@/components/editor/editor";

export const metadata: Metadata = {
  title: "Video editor — SnapPromo",
  description: "Trim, split and arrange your video clips. Add text, mix audio and export your edit as MP4.",
};

async function AccountEditor() {
  const user = await requireAccount();
  return <Editor key={user.id} userId={user.id} />;
}

export default function EditorPage() {
  return <Suspense><AccountEditor /></Suspense>;
}
