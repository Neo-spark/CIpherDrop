"use client"

import Link from "next/link"
import { ShieldCheck } from "lucide-react"

export default function Footer() {
  return (
    <footer className="pt-12 pb-6 border-t border-brand-border/30">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-brand-primary to-brand-accent flex items-center justify-center shadow-lg overflow-hidden">
              <ShieldCheck className="w-5 h-5 text-brand-textInverse" />
            </div>
            <span className="font-display text-xl font-bold tracking-tight text-brand-text">CipherDrop</span>
          </div>

          <div className="text-brand-textSecondary text-sm">
            {" "}
            End-to-end encrypted. Files are never stored by CipherDrop.
            {" "}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 text-center md:text-left">
          <div>
            <h4 className="font-semibold text-brand-text text-sm mb-4">Quick links</h4>
            <nav className="space-y-3">
              <Link href="/" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">Home</Link>
              <Link href="#features" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">Features</Link>
              <Link href="#how-it-works" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">How it works</Link>
              <Link href="#security" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">Security</Link>
            </nav>
          </div>

          <div>
            <h4 className="font-semibold text-brand-text text-sm mb-4">Company</h4>
            <nav className="space-y-3">
              <Link href="#security" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">Privacy policy</Link>
              <Link href="#security" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">Terms of service</Link>
              <Link href="#security" className="text-brand-textSecondary hover:text-brand-primary transition-colors text-sm">Security</Link>
            </nav>
          </div>
        </div>

        <div className="pt-8 border-t border-brand-border/20 flex flex-col md:flex-row justify-between items-center gap-4 text-brand-textSecondary text-xs">
          <span>2025 CipherDrop. All rights reserved.</span>
          <div className="flex gap-2">
            <Link href="https://github.com/Neo-spark/CIpherDrop" className="text-brand-textSecondary hover:text-brand-primary transition-colors" aria-label="GitHub">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-surface border border-brand-border/50">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.3 8.207 10.057l3.02-3.02C20.536 17.59 24 11.302 24 5.373 24 5.373 12 0 12 0zM12 2.165l-2.875 6.828L12 21.233l5.788-2.707 2.875-6.828L12 2.165z"/></svg>
              </div>
            </Link>
            <Link href="https://www.linkedin.com" className="text-brand-textSecondary hover:text-brand-primary transition-colors" aria-label="LinkedIn">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-brand-surface border border-brand-border/50">
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 7h-4a7 7 0 0 0-7 7v3.15a3.5 3.5 0 1 0 5.058 2.068L13 17.528l1.814-1.113a3.5 3.5 0 0 0 2.077-5.058V11a7 7 0 0 0-7-7H5l-4 4v1.553a3.5 3.5 0 1 0 5.058 2.068l1.815 1.113c.27.167.527.36.727.556l3.525 3.196L21 9l-4.047-3.687a3.5 3.5 0 0 0-2.077-5.058z"/></svg>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}