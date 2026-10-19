"use client"

import { motion } from "framer-motion"
import { Zap, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Cta() {
  return (
    <section className="relative overflow-hidden py-28 md:py-36 lg:py-40 bg-gradient-to-b from-brand-surface/80 via-brand-bg to-brand-surface">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-5%] left-[5%] w-[500px] h-[500px] bg-brand-primary/10 rounded-full blur-[120px] animate-blob" />
        <div className="absolute bottom-[-5%] right-[5%] w-[400px] h-[400px] bg-brand-accent/10 rounded-full blur-[120px] animate-blob-delay-2" />
      </div>

      <div className="max-w-7xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-semibold tracking-wide uppercase mb-6">
            E2E encrypted by default
          </span>

          <h2 className="font-display text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-brand-text mb-6">
            Ready to experience<br />
            secure file sharing?
          </h2>

          <p className="text-brand-textSecondary text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10">
            No accounts. No permanent storage. Just encrypted peer-to-peer transfers between browsers. Get started in under a minute.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="xl" href="/app" className="flex-1">
              <Zap className="w-5 h-5" /> Launch Transfer
            </Button>
            <Button variant="outline" size="xl" asChild href="#features" className="flex-1">
              <Globe className="w-5 h-5" /> Learn more
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}