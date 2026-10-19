"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ShieldCheck, X, Menu, ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { name: "Features", href: "#features" },
  { name: "How it works", href: "#how-it-works" },
  { name: "Security", href: "#security" },
  { name: "Pricing", href: "#pricing" },
]

export default function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <nav ref={navRef} className={cn("fixed inset-x-0 top-0 z-50", scrolled ? "shadow-sm" : "")} aria-label="Main navigation">
      <div className="relative z-20">
        <div className="nav-surface relative">
          <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-3" aria-label="CipherDrop home">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary shadow-glow-primary">
                <ShieldCheck className="w-5 h-5 text-brand-textInverse" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-brand-text">Cipher<span className="text-brand-primary">Drop</span></span>
            </Link>

            <div className="hidden items-center gap-8 text-sm font-medium md:flex">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-brand-textSecondary transition-colors hover:text-brand-text"
                  onClick={() => setOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
              <Button asChild size="sm" href="/app" className="ml-4 gap-2 px-5">
                Open app <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="md:hidden h-10 w-10 rounded-lg">
                <Menu className="w-5 h-5" />
              </Button>
              <Button asChild size="sm" href="/app" className="hidden gap-2 px-5 md:flex">
                Open app <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed inset-x-0 top-16 z-40 border-b border-brand-border/60 bg-brand-bg/90 backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile menu"
          >
            <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-6">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  className="text-brand-text hover:text-brand-primary"
                  onClick={() => setOpen(false)}
                >
                  {link.name}
                </Link>
              ))}
              <div className="border-t border-brand-border/60 mt-4 pt-4 flex flex-col gap-3">
                <Button asChild size="lg" href="/app" className="w-full justify-center">
                  Launch App
                </Button>
              </div>
            </div>
            <motion.button
              onClick={() => setOpen(false)}
              className="absolute top-6 right-6 text-brand-textSecondary hover:text-brand-text"
              initial={{ scale: 1 }}
              animate={{ scale: 1 }}
              whileHover={{ scale: 0.95 }}
            >
              <X className="w-5 h-5" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}