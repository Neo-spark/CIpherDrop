"use client"

import { motion } from "framer-motion"
import { Quote } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const TESTIMONIALS = [
  {
    name: "Maya Chen",
    role: "Product Engineer, Heathrow",
    company: "Heathrow Labs",
    content: "We needed to move sensitive design files between contractors quickly without spinning up another SaaS account. CipherDrop's peer-to-peer model meant nothing touched a third-party server.",
    avatar: "MC",
  },
  {
    name: "Darius Okonkwo",
    role: "Security Researcher",
    company: "Nebula Security",
    content: "The six-digit safety code verification gives me confidence that the right person is on the other end. AES-256-GCM with ephemeral keys is exactly what I'd want to see.",
    avatar: "DO",
  },
  {
    name: "Lena Petrova",
    role: "Freelance Consultant",
    company: "Independent",
    content: "No sign-up, no installation, just a code and a transfer. I've used it to send contracts and PDFs to clients who don't want to create accounts either.",
    avatar: "LP",
  },
]

export default function Testimonials() {
  return (
    <section id="testimonials" className="relative overflow-hidden py-24 md:py-32 lg:py-40">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] bg-brand-primary/10 rounded-full blur-[120px] animate-blob" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-brand-accent/10 rounded-full blur-[120px] animate-blob-delay-4" />
      </div>

      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-xs font-semibold tracking-wide uppercase mb-4">
            Trusted by people who move files
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-brand-text mb-6">
            What users say about CipherDrop
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {TESTIMONIALS.map((t, index) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.15, duration: 0.7 }}
              whileHover={{ y: -4 }}
            >
              <Card className="p-8">
                <CardContent className="pb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mb-6 bg-brand-surface border border-brand-border">
                    <Quote className="w-5 h-5 text-brand-textSecondary" />
                  </div>
                  <p className="text-brand-text text-sm md:text-base leading-relaxed mb-6 italic">
                    &ldquo;{t.content}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-brand-text font-semibold text-sm">{t.name}</span>
                      <span className="text-brand-textSecondary text-xs">{t.role}</span>
                    </div>
                    <div className="ml-auto text-xs text-brand-textSecondary uppercase tracking-wider font-medium">
                      {t.company}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
