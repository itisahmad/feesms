"use client"

import { motion } from "framer-motion"
import { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { AnimatedNumber } from "./animated-number"

interface StatCardProps {
  title: string
  value: number
  subtitle?: string
  icon: LucideIcon
  accent?: "teal" | "amber" | "violet" | "cyan"
  prefix?: string
  suffix?: string
  delay?: number
  formatValue?: (n: number) => string
}

const accents = {
  teal: {
    icon: "bg-teal-500/20 text-teal-300 ring-teal-400/30",
    glow: "from-teal-500/20 via-cyan-500/10 to-transparent",
    value: "text-teal-300",
  },
  amber: {
    icon: "bg-amber-500/20 text-amber-300 ring-amber-400/30",
    glow: "from-amber-500/20 via-orange-500/10 to-transparent",
    value: "text-amber-300",
  },
  violet: {
    icon: "bg-violet-500/20 text-violet-300 ring-violet-400/30",
    glow: "from-violet-500/20 via-fuchsia-500/10 to-transparent",
    value: "text-violet-300",
  },
  cyan: {
    icon: "bg-cyan-500/20 text-cyan-300 ring-cyan-400/30",
    glow: "from-cyan-500/20 via-teal-500/10 to-transparent",
    value: "text-cyan-300",
  },
}

export function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent = "teal",
  prefix = "",
  suffix = "",
  delay = 0,
  formatValue,
}: StatCardProps) {
  const style = accents[accent]

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="glass-panel group relative overflow-hidden p-6"
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br blur-2xl transition-opacity duration-500 group-hover:opacity-100 opacity-60",
          style.glow
        )}
      />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[var(--dash-text-muted)]">{title}</p>
          <p className={cn("mt-2 text-3xl font-bold tracking-tight tabular-nums", style.value)}>
            {prefix}
            <AnimatedNumber value={value} format={formatValue} />
            {suffix}
          </p>
          {subtitle && (
            <p className="mt-2 text-xs text-[var(--dash-text-muted)]">{subtitle}</p>
          )}
        </div>
        <motion.div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1",
            style.icon
          )}
          whileHover={{ rotate: [0, -8, 8, 0], scale: 1.05 }}
          transition={{ duration: 0.4 }}
        >
          <Icon className="h-6 w-6" />
        </motion.div>
      </div>
    </motion.div>
  )
}
