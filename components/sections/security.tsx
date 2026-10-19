"use client"

import { motion } from "framer-motion"
import { ShieldCheck, Lock, Zap, Globe, EyeOff, Database } from "lucide-react"
import { Card, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const SECURITY = [
  {
    icon: ShieldCheck,
    title: "AES-256-GCM",
    label: "Authenticated encryption",
    description: "Every control message and file chunk is encrypted with AES-256-GCM before it leaves the browser.",
    badge: "Standard",
  },
  {
    icon: Lock,
    title: "ECDH P-256",
    label: "Ephemeral key exchange",
    description: "Fresh elliptic-curve key pairs are generated for every session. Keys are never reused or persisted.",
    badge: "Ephemeral",
  },
  {
    icon: Zap,
    title: "HKDF-SHA-256",
    label: "Directional key derivation",
    description: "Independent send and receive keys are derived per direction, bound to the room code and public keys.",
    badge: "Per-session",
  },
  {
    icon: EyeOff,
    title: "Zero knowledge",
    label: "No file storage",
    description: "File bytes travel peer-to-peer over WebRTC. CipherDrop's servers never receive or store your content.",
    badge: "P2P",
  },
  {
    icon: Database,
    title: "1-hour expiry",
    label: "Temporary rooms",
    description: "Rooms and signaling records expire after one hour. Ending a session clears the tray and destroys the connection.",
    badge: "Ephemeral",
  },
  {
    icon: Globe,
    title: "Replay detection",
    label: "Packet integrity",
    description: "Encrypted packets carry sequence-based nonces and authenticated additional data to prevent replay and tampering.",
    badge: "Verified",
  },
]

export default function Security() {
  return (
    <section id="security" className="relative overflow-hidden py-24 md:py-32 lg:py-40 bg-brand-surface/30 border-y border-brand-border/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs font-semibold tracking-wide uppercase mb-4">
            Security first
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-brand-text mb-6">
            Built to be trustworthy, not just trusted
          </h2>
          <p className="text-brand-textSecondary max-w-xl mx-auto leading-relaxed">
            Cryptography you can verify. Encryption that happens on your device, before a single byte moves.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {SECURITY.map((item, index) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08, duration: 0.6 }}
                whileHover={{ y: -4 }}
              >
                <Card className="group border-brand-border/80 hover:border-brand-primary/60">
                  <CardContent className="p-6 pt-5">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 bg-white/5 border border-white/10 group-hover:bg-brand-primary/20 transition-colors">
                      <Icon className="w-6 h-6 text-brand-primary group-hover:text-brand-text" />
                    </div>
                    <Badge variant="outline" className="mb-4">
                      {item.badge}
                    </Badge>
                    <CardTitle className="mb-2">{item.title}</CardTitle>
                    <CardDescription className="text-brand-textSecondary text-sm">{item.description}</CardDescription>
                  </CardContent>
                  <div className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="w-2 h-2 rounded-full bg-brand-emerald" />
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
