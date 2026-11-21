import type { Metadata } from "next";
import { Editor } from "@/components/editor/editor";

export const metadata: Metadata = {
  title: "Video editor — SnapPromo",
  description: "Trim, split and arrange your video clips. Add text, mix audio and export your edit as MP4.",
};

export default function EditorPage() {
  return <Editor />;
}
