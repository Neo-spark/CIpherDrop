"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: "default" | "secondary" | "outline" | "success" | "warning"
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant = "default", ...props }, ref) => {
  const base = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors"
  const variants = {
    default: "bg-brand-surface border-brand-border text-brand-textSecondary",
    secondary: "bg-brand-surfaceHover border-brand-borderLight text-brand-text",
    outline: "border-brand-border text-brand-textSecondary",
    success: "bg-brand-emeraldSoft border-brand-emerald/30 text-brand-emerald",
    warning: "bg-brand-accentSoft border-brand-accent/30 text-brand-accent",
  }
  return <div ref={ref} className={cn(base, variants[variant], className)} {...props} />
})
Badge.displayName = "Badge"

export { Badge }
