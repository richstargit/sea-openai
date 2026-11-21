import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";
import { LanguageProvider } from "@/components/language-provider";
import { cn } from "@/lib/utils";

// Apple devices resolve Latin to SF through the system stack in globals.css.
// Inter covers Latin elsewhere; Noto Sans Thai covers Thai everywhere so the
// Thai glyphs look the same on every device.
const latin = Inter({
  subsets: ["latin"],
  variable: "--font-latin",
  display: "swap",
});

const thai = Noto_Sans_Thai({
  subsets: ["thai"],
  variable: "--font-thai",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SnapPromo — Product photos to video ads",
  description:
    "Take 3–5 product photos and let AI create vertical video ads with scripts, voiceovers, subtitles and music.",
};

export const viewport: Viewport = {
  themeColor: "#fbfbfd",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", latin.variable, thai.variable)}
    >
      <body className="flex min-h-full flex-col"><LanguageProvider>{children}</LanguageProvider></body>
    </html>
  );
}
