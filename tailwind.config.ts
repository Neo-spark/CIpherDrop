import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#0a0a0c",
          surface: "#111219",
          surfaceHover: "#161721",
          surfaceRaised: "#1c1d27",
          border: "#1f2029",
          borderLight: "#2a2c37",
          borderFocus: "#8b5cf6",
          text: "#fafafa",
          textSecondary: "#a1a1aa",
          textMuted: "#71717a",
          textInverse: "#0a0a0c",
          primary: "#8b5cf6",
          primaryHover: "#7c3aed",
          primarySoft: "rgba(139, 92, 246, 0.16)",
          primaryGlow: "rgba(139, 92, 246, 0.35)",
          accent: "#22d3ee",
          accentSoft: "rgba(34, 211, 238, 0.16)",
          accentGlow: "rgba(34, 211, 238, 0.3)",
          emerald: "#10b981",
          emeraldSoft: "rgba(16, 185, 129, 0.16)",
          danger: "#fb7185",
          dangerSoft: "rgba(251, 113, 133, 0.16)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["var(--font-inter)", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
      },
      fontSize: {
        "display-lg": ["clamp(2.5rem, 5vw + 1rem, 4.5rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        "display-md": ["clamp(2rem, 4vw + 0.75rem, 3.5rem)", { lineHeight: "1.1", letterSpacing: "-0.02em" }],
        "h1": ["clamp(1.75rem, 3vw + 0.5rem, 2.75rem)", { lineHeight: "1.2", letterSpacing: "-0.02em" }],
        "h2": ["clamp(1.5rem, 2.5vw + 0.5rem, 2.25rem)", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
        "h3": ["clamp(1.25rem, 2vw + 0.25rem, 1.75rem)", { lineHeight: "1.3", letterSpacing: "-0.01em" }],
        "body-lg": ["1.125rem", { lineHeight: "1.7" }],
        "body": ["1rem", { lineHeight: "1.7" }],
        "body-sm": ["0.875rem", { lineHeight: "1.6" }],
        "caption": ["0.75rem", { lineHeight: "1.5", letterSpacing: "0.04em" }],
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
        "26": "6.5rem",
        "90": "22.5rem",
      },
      borderRadius: {
        sm: "8px",
        DEFAULT: "12px",
        md: "16px",
        lg: "20px",
        xl: "24px",
        "2xl": "32px",
        "3xl": "40px",
        full: "9999px",
      },
      boxShadow: {
        sm: "0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.4)",
        lg: "0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4)",
        xl: "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.5)",
        "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.6)",
        "inner-glow": "inset 0 0 20px rgba(139, 92, 246, 0.1)",
        "glow-primary": "0 0 40px rgba(139, 92, 246, 0.25), 0 0 80px rgba(139, 92, 246, 0.1)",
        "glow-accent": "0 0 40px rgba(34, 211, 238, 0.25), 0 0 80px rgba(34, 211, 238, 0.1)",
        "glass": "0 8px 32px 0 rgba(0, 0, 0, 0.4)",
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "fade-in": "fadeIn 0.7s ease-out forwards",
        "fade-in-up": "fadeInUp 0.8s ease-out forwards",
        "fade-in-down": "fadeInDown 0.8s ease-out forwards",
        "slide-up": "slideUp 0.8s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        "float": "float 6s ease-in-out infinite",
        "float-delayed": "float 8s ease-in-out infinite",
        "pulse-slow": "pulseSlow 4s ease-in-out infinite",
        "blob": "blob 7s infinite",
        "scan": "scan 2s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeInDown: {
          "0%": { opacity: "0", transform: "translateY(-30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(40px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        blob: {
          "0%": { transform: "translate(0px, 0px) scale(1)" },
          "33%": { transform: "translate(30px, -50px) scale(1.1)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.9)" },
          "100%": { transform: "translate(0px, 0px) scale(1)" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
      },
      transitionTimingFunction: {
        "smooth": "cubic-bezier(0.4, 0, 0.2, 1)",
        "bouncy": "cubic-bezier(0.68, -0.55, 0.265, 1.55)",
      },
    },
  },
  plugins: [],
}

export default config
