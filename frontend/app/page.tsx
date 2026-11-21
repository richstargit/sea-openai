import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { VideoSteps } from "@/components/sections/video-steps";
import { VoiceStatement } from "@/components/sections/voice-statement";
import { LiveSection } from "@/components/sections/live-section";
import { FinalCta } from "@/components/sections/final-cta";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex-1">
        <Hero />
        <LiveSection />
        <VideoSteps />
        <VoiceStatement />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
