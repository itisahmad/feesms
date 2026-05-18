'use client'

import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { ReactNode } from 'react'

interface ModalProps {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  xl?: boolean
}

export function DashboardModal({ title, subtitle, onClose, children, wide, xl }: ModalProps) {
  const widthClass = xl ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`glass-panel-strong max-h-[90vh] w-full overflow-y-auto ${widthClass}`}
      >
        <div
          className="sticky top-0 z-10 flex items-start justify-between border-b px-6 py-4 backdrop-blur-xl"
          style={{
            borderColor: 'var(--dash-glass-border)',
            background: 'var(--dash-sidebar)',
          }}
        >
          <div>
            <h2 className="text-lg font-semibold text-[var(--dash-text-title)]">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-[var(--dash-text-muted)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--dash-text-muted)] transition hover:bg-[var(--dash-hover)] hover:text-[var(--dash-text-title)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </div>
  )
}
