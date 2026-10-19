"use client"

import { motion } from "framer-motion"
import { ShieldCheck, Zap, Globe, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const PLANS = [
  {
    name: "Free",
    price: "$0",
    description: "For occasional personal transfers.",
    popular: false,
    features: [
      { label: "Up to 100 MB per file", icon: Zap, available: true },
      { label: "Peer-to-peer transfer", icon: Globe, available: true },
      { label: "AES-256-GCM encryption", icon: ShieldCheck, available: true },
      { label: "One-hour session expiry", icon: Lock, available: true },
      { label: "No account required", icon: Globe, available: true },
    ],
    cta: "Get started",
  },
  {
    name: "Pro",
    price: "$9",
    description: "For professionals and small teams.",
    popular: true,
    features: [
      { label: "Up to 500 MB per file", icon: Zap, available: true },
      { label: "Peer-to-peer transfer", icon: Globe, available: true },
      { label: "AES-256-GCM encryption", icon: ShieldCheck, available: true },
      { label: "Priority relay access", icon: ShieldCheck, available: true },
      { label: "Custom session expiry", icon: Lock, available: true },
      { label: "Team safety codes", icon: Globe, available: true },
    ],
    cta: "Start free trial",
  },
  {
    name: "Enterprise",
    price: "Contact",
    description: "For organizations with compliance needs.",
    popular: false,
    features: [
      { label: "Unlimited file size", icon: Zap, available: true },
      { label: "Self-hosted relay option", icon: Globe, available: true },
      { label: "AES-256-GCM encryption", icon: ShieldCheck, available: true },
      { label: "Custom session policies", icon: Lock, available: true },
      { label: "SAML/SSO integration", icon: ShieldCheck, available: true },
      { label: "Dedicated support", icon: Globe, available: true },
    ],
    cta: "Contact sales",
  },
]

export default function Pricing() {
  return (
    <section id="pricing" className="relative overflow-hidden py-24 md:py-32 lg:py-40 bg-brand-surface/30 border-y border-brand-border/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-semibold tracking-wide uppercase mb-4">
            Simple, transparent pricing
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-brand-text mb-6">
            Choose the plan that fits your needs
          </h2>
          <p className="text-brand-textSecondary max-w-xl mx-auto leading-relaxed">
            All plans include end-to-end encryption and peer-to-peer transfers. Upgrade anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {PLANS.map((plan) => {
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: plan.popular ? -10 : 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: plan.popular ? 0.1 : PLANS.indexOf(plan) * 0.1, duration: 0.7 }}
                whileHover={{ y: -4 }}
                className={cn(
                  "relative flex flex-col",
                  plan.popular ? "scale-105 z-10 ring-1 ring-brand-primary/20 shadow-2xl" : "",
                )}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 z-20" variant="success">
                    Most popular
                  </Badge>
                )}
                <Card className="flex-1 flex flex-col border-brand-border/60 hover:border-brand-primary/50 transition-all">
                  <CardHeader className="pb-5">
                    <div className="flex items-baseline gap-1">
                      <span className="text-brand-text font-display text-3xl font-bold">{plan.price}</span>
                      {plan.price === "$9" && <span className="text-brand-textSecondary text-sm font-medium">/mo</span>}
                    </div>
                    <p className="text-brand-textSecondary text-sm mt-2">{plan.description}</p>
                  </CardHeader>
                  <CardContent className="flex-1 pb-8">
                    <ul className="space-y-4">
                      {plan.features.map((f, idx) => {
                        const FeatureIcon = f.icon
                        return (
                          <li key={idx} className="flex items-start gap-3">
                            <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 bg-brand-surface border border-brand-border">
                              <FeatureIcon className={cn("w-3 h-3", f.available ? "text-brand-emerald" : "text-brand-textMuted")} />
                            </div>
                            <span className={cn("text-sm leading-relaxed", f.available ? "text-brand-text" : "text-brand-textSecondary line-through")}>
                              {f.label}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant={plan.popular ? "default" : "outline"}
                      size="lg"
                      href="/app"
                      className="w-full"
                    >
                      {plan.cta}
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
