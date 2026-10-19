"use client"

import { motion } from "framer-motion"
import { ArrowUpRight, Check, FileText, LockKeyhole, ShieldCheck, Sparkles, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"

const TRUST_POINTS = ["No account", "No tracking", "No file storage"]

export default function Hero() {
  return (
    <section className="hero-section relative overflow-hidden">
      <div className="hero-grid absolute inset-0 -z-10" />
      <div className="hero-orb hero-orb-primary absolute -left-40 top-24 -z-10" />
      <div className="hero-orb hero-orb-accent absolute -right-40 top-40 -z-10" />

      <div className="mx-auto grid max-w-7xl items-center gap-16 px-6 pb-24 pt-32 md:pb-32 md:pt-44 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}>
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Private file transfer, rethought
          </div>
          <h1 className="hero-title mt-7">
            Your files.
            <br />
            <span>Only between you.</span>
          </h1>
          <p className="hero-copy mt-7">
            CipherDrop creates a private, encrypted bridge between two browsers. Send sensitive files without accounts, upload queues, or a digital paper trail.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="xl" href="/app" className="hero-primary-button gap-2">
              Start a private transfer <ArrowUpRight className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="xl" asChild href="#how-it-works" className="gap-2">
              See how it works
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
            {TRUST_POINTS.map((point) => (
              <span key={point} className="trust-point"><Check className="h-4 w-4" />{point}</span>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: .96, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: .15, duration: .8 }}
          className="hero-product-wrap"
        >
          <div className="hero-product-card">
            <div className="product-topline">
              <div className="product-brand"><span className="product-mark"><ShieldCheck className="h-4 w-4" /></span> CipherDrop</div>
              <span className="live-pill"><span />Private mode</span>
            </div>
            <div className="product-heading">
              <span className="product-kicker">NEW TRANSFER</span>
              <h2>Move something<br /><span>that matters.</span></h2>
              <p>Encrypted in your browser. Delivered directly to one trusted device.</p>
            </div>
            <div className="drop-zone">
              <div className="drop-icon"><Sparkles className="h-5 w-5" /></div>
              <strong>Drop a file here</strong>
              <span>or choose from your device</span>
              <div className="drop-button">Choose file <ArrowUpRight className="h-4 w-4" /></div>
            </div>
            <div className="product-file">
              <span className="file-icon"><FileText className="h-4 w-4" /></span>
              <span><strong>confidential-project.pdf</strong><small>2.4 MB · Ready to encrypt</small></span>
              <LockKeyhole className="ml-auto h-4 w-4 text-brand-emerald" />
            </div>
            <div className="product-footer"><span><Zap className="h-3.5 w-3.5" /> WebRTC direct</span><span>Expires in 1 hour</span></div>
          </div>
          <div className="hero-float-card hero-float-top"><span className="float-check"><Check className="h-3 w-3" /></span><span><strong>End-to-end encrypted</strong><small>Before it leaves your device</small></span></div>
          <div className="hero-float-card hero-float-bottom"><span className="float-number">01</span><span><strong>One trusted recipient</strong><small>Nothing is stored</small></span></div>
        </motion.div>
      </div>
    </section>
  )
}
