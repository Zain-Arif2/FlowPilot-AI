import { LandingHero } from "./landing-hero.js";
import { LandingNavbar } from "./landing-navbar.js";
import { LandingSections } from "./landing-sections.js";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#121118]">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingSections />
      </main>
    </div>
  );
}
