'use client'

import { motion } from 'framer-motion'
import { Skeleton } from '@/components/ui/skeleton'

export function PageLoading() {
  return (
    <motion.div className="space-y-6 animate-pulse" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-80 rounded-2xl" />
    </motion.div>
  )
}

export function InlineLoading({ message = 'Loading…' }: { message?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-center gap-3 py-16 text-slate-500"
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-400" />
      <span className="text-sm">{message}</span>
    </motion.div>
  )
}
