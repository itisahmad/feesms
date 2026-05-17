"use client"

import { useEffect, useState } from "react"
import { motion, useSpring } from "framer-motion"

interface AnimatedNumberProps {
  value: number
  format?: (n: number) => string
  className?: string
}

export function AnimatedNumber({
  value,
  format = (n) => n.toLocaleString("en-IN"),
  className,
}: AnimatedNumberProps) {
  const spring = useSpring(0, { stiffness: 60, damping: 20 })
  const [display, setDisplay] = useState("0")

  useEffect(() => {
    spring.set(value)
    const unsub = spring.on("change", (v) => setDisplay(format(Math.round(v))))
    return () => unsub()
  }, [value, spring, format])

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      {display}
    </motion.span>
  )
}
