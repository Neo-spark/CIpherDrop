"use client"
/* eslint-disable react/prop-types */

import * as React from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "outline" | "danger" | "glass"
    | "ghost"
  size?: "sm" | "md" | "lg" | "xl" | "full"
  href?: string
  asChild?: boolean
}

const Button = ({ className, variant = "default", size = "md", href, asChild, children, ...props }: ButtonProps) => {
  const defaultClass = "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-colors"
  const variantClass = {
    default: "bg-brand-primary text-brand-textInverse shadow-lg shadow-brand-primary/20 hover:bg-brand-primaryHover",
    secondary: "bg-brand-surfaceHover text-brand-text border border-brand-borderHover",
    outline: "border border-brand-border text-brand-text hover:border-brand-primary/70 hover:bg-brand-primary/10",
    ghost: "text-brand-textSecondary hover:bg-brand-surfaceHover hover:text-brand-text",
    danger: "bg-brand-danger text-brand-textInverse",
    glass: "bg-white/5 backdrop-blur-md border border-white/10 text-brand-text",
  }[variant]
  const sizeClass = {
    sm: "h-9 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
    xl: "h-14 px-8 text-lg",
    full: "w-full",
  }[size]
  const combinedClassName = cn(defaultClass, variantClass, sizeClass, className)

  if (href || asChild) {
    return <Link href={href ?? "#"} className={combinedClassName}>{children}</Link>
  }

  return <button className={combinedClassName} {...props}>{children}</button>
}

export { Button }