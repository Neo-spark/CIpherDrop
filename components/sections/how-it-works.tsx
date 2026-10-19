"use client"

import { motion } from "framer-motion"
import { ArrowRight, Circle, Lock, CheckCircle2 } from "lucide-react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const STEPS = [
  {
    number: "01",
    title: "Choose your direction",
    description: "Decide whether this device will send or receive files. The direction is locked for the entire session.",
    icon: ArrowRight,
  },
  {
    number: "02",
    title: "Create a room",
    description: "Generate a one-time connection code, private QR invitation, or invitation link. Share it with one trusted person.",
    icon: Circle,
  },
  {
    number: "03",
    title: "Pair and verify",
    description: "The other device joins with the code or link. Both sides compare the six-digit safety code before anything is sent.",
    icon: Lock,
  },
  {
    number: "04",
    title: "Transfer securely",
    description: "The sender selects a file and the receiver explicitly approves it. Encrypted bytes flow directly peer-to-peer.",
    icon: CheckCircle2,
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="relative overflow-hidden py-24 md:py-32 lg:py-40">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-20">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-semibold tracking-wide uppercase mb-4">
            Simple by design
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-brand-text mb-6">
            How a secure transfer works
          </h2>
          <p className="text-brand-textSecondary max-w-xl mx-auto leading-relaxed">
            Four steps from start to verified delivery. No accounts, no permanent storage, no surprises.
          </p>
        </div>

        <div className="relative grid md:grid-cols-2 gap-12 items-start">
          {/* Vertical connector line */}
          <div className="hidden md:block absolute left-1/2 top-20 bottom-20 w-px bg-brand-border/50 z-0" />

          {STEPS.map((step, index) => {
            const Icon = step.icon
            const isEven = index % 2 === 0
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, x: isEven ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.15, duration: 0.6 }}
                className={cn(
                  "relative z-10 px-6",
                  isEven ? "pr-[calc(50%+40px)] text-right" : "pl-[calc(50%+40px)]",
                )}
              >
                {/* Step marker */}
                <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20">
                  <div className="w-10 h-10 rounded-full bg-brand-surface border-2 border-brand-border flex items-center justify-center shadow-lg group-hover:border-brand-primary transition-colors">
                    <span className="text-brand-textSecondary font-mono font-bold text-sm">{step.number}</span>
                  </div>
                </div>

                <Card className="relative">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-brand-surfaceRaised border border-brand-border">
                        <Icon className="w-5 h-5 text-brand-textSecondary" />
                      </div>
                      <h3 className="text-brand-text font-semibold">{step.title}</h3>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-8">
                    <p className="text-brand-textSecondary text-sm leading-relaxed">{step.description}</p>
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
