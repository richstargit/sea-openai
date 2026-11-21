import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/sections/hero";
import { Statement } from "@/components/sections/statement";
import { Pipeline } from "@/components/sections/pipeline";
import { Products } from "@/components/sections/products";
import { Hooks } from "@/components/sections/hooks";
import { LiveDemo } from "@/components/sections/live-demo";
import { Measure } from "@/components/sections/measure";
import { FinalCta } from "@/components/sections/final-cta";

export default function Home() {
  return (
    <>
      <SiteNav />
      <main id="main" className="flex-1">
        <Hero />
        <Statement />
        <Pipeline />
        <Products />
        <Hooks />
        <LiveDemo />
        <Measure />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
