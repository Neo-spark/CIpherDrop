"use client"

import { motion } from "framer-motion"
import { ShieldCheck, Zap, Globe, Lock, Clock, ArrowRight } from "lucide-react"
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "End-to-end encryption",
    description: "Files are encrypted in the browser before they ever leave your device. Only the intended recipient can decrypt them.",
    badge: "AES-256-GCM",
    color: "text-brand-emerald",
  },
  {
    icon: Zap,
    title: "Peer-to-peer transfer",
    description: "File bytes travel directly between browsers over a WebRTC data channel — CipherDrop never sees or stores your content.",
    badge: "WebRTC",
    color: "text-brand-primary",
  },
  {
    icon: Globe,
    title: "No account required",
    description: "Start a room instantly with a one-time code or private invitation link. No sign-up, no login, no personal data collected.",
    badge: "Zero signup",
    color: "text-brand-accent",
  },
  {
    icon: Lock,
    title: "Explicit approval",
    description: "The receiver must explicitly accept each file before transfer begins. Nothing downloads automatically to your device.",
    badge: "Opt-in only",
    color: "text-brand-primary",
  },
  {
    icon: Clock,
    title: "Temporary sessions",
    description: "Rooms expire after one hour and the received tray lives only in browser memory. Ending a session destroys the connection.",
    badge: "1-hour expiry",
    color: "text-brand-accent",
  },
  {
    icon: ArrowRight,
    title: "One immutable direction",
    description: "Each session is locked to one transfer direction — send or receive — so there is no ambiguity about who owns the file flow.",
    badge: "One-way",
    color: "text-brand-primary",
  },
]

export default function Features() {
  return (
    <section id="features" className="relative overflow-hidden py-24 md:py-32 lg:py-40">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] left-[10%] w-[600px] h-[600px] bg-brand-primary/10 rounded-full blur-[120px] animate-blob" />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] bg-brand-accent/10 rounded-full blur-[120px] animate-blob-delay-2" />
      </div>

      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-semibold tracking-wide uppercase mb-4">
            Capabilities
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-brand-text mb-6">
            Everything you need to move files securely
          </h2>
          <p className="text-brand-textSecondary max-w-xl mx-auto leading-relaxed">
            Built for trust. Every interaction is designed to be transparent, private, and effortless.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((feature, index) => {
          const Icon = feature.icon
          return (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.6 }}
              whileHover={{ y: -4 }}
              className="group relative"
            >
              <Card className="hover:border-brand-primary/50 hover:shadow-glow-primary/40">
                <CardContent className="pt-8 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-white/5 border border-white/10">
                      <Icon className={cn("w-6 h-6", feature.color)} />
                    </div>
                    <Badge variant={feature.badge === "Zero signup" ? "success" : "outline"} className="ml-auto">
                      {feature.badge}
                    </Badge>
                  </div>
                  <CardTitle className="mt-6 mb-3">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
        </div>
      </div>
    </section>
  )
}
