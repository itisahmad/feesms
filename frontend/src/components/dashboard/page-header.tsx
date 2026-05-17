'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  highlight?: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
}

export function PageHeader({ title, highlight, subtitle, eyebrow, icon: Icon, actions }: PageHeaderProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
    >
      <motion.div>
        {eyebrow && (
          <p className="mb-1 flex items-center gap-2 text-sm text-teal-400/90">
            {Icon && <Icon className="h-4 w-4" />}
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-bold tracking-tight text-[var(--dash-text-title)] md:text-4xl">
          {title}
          {highlight && <span className="text-gradient"> {highlight}</span>}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-sm text-[var(--dash-text-muted)]">{subtitle}</p>}
      </motion.div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </motion.div>
  );
}
