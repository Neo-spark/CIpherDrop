import Hero from "@/components/sections/hero";
import Features from "@/components/sections/features";
import HowItWorks from "@/components/sections/how-it-works";
import Security from "@/components/sections/security";
import Testimonials from "@/components/sections/testimonials";
import Pricing from "@/components/sections/pricing";
import Cta from "@/components/sections/cta";
import Nav from "@/components/nav";
import Footer from "@/components/footer";

export default function Home() {
  return (
    <main>
      <Nav />

      {/* Hero */}
      <Hero />

      {/* Features */}
      <Features />

      {/* How it works */}
      <HowItWorks />

      {/* Security */}
      <Security />

      {/* Testimonials */}
      <Testimonials />

      {/* Pricing */}
      <Pricing />

      {/* CTA */}
      <Cta />

      {/* Footer */}
      <Footer />
    </main>
  )
}