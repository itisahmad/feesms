/** Shared class names for dashboard — uses CSS variables from globals.css */
export const dash = {
  label: 'block text-sm font-medium text-[var(--dash-text-muted)] mb-1.5',
  field:
    'w-full rounded-xl border border-[var(--dash-glass-border)] bg-[var(--dash-input-bg)] px-4 py-2.5 text-sm text-[var(--dash-text-body)] placeholder:text-[var(--dash-text-muted)] focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50',
  nativeSelect: 'dash-native-select w-full rounded-xl border border-[var(--dash-glass-border)] bg-[var(--dash-input-bg)] px-4 py-2.5 text-sm text-[var(--dash-text-body)] focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50',
  fieldSm:
    'rounded-lg border border-[var(--dash-glass-border)] bg-[var(--dash-input-bg)] px-2.5 py-1.5 text-sm text-[var(--dash-text-body)] focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/20',
  sectionTitle: 'text-lg font-semibold text-[var(--dash-text-title)]',
  link: 'text-sm font-medium text-teal-600 transition hover:text-teal-500 dark:text-teal-400 dark:hover:text-teal-300',
  linkDanger: 'text-sm font-medium text-red-600 transition hover:text-red-500 dark:text-red-400 dark:hover:text-red-300',
  error: 'rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300',
  warn: 'rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300',
  success: 'rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-sm text-teal-700 dark:text-teal-300',
  empty: 'py-12 text-center text-sm text-[var(--dash-text-muted)]',
  table: 'w-full text-sm',
  thead: 'border-b border-[var(--dash-glass-border)]',
  th: 'text-left py-3 px-4 text-xs font-semibold uppercase tracking-wider text-[var(--dash-text-muted)]',
  tr: 'border-b border-[var(--dash-glass-border)] transition hover:bg-[var(--dash-row-hover)]',
  td: 'py-4 px-4 text-[var(--dash-text-body)]',
  badge: 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
  badgeTeal: 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  badgeAmber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  badgeRed: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  tabActive:
    'rounded-xl bg-gradient-to-r from-teal-500/25 to-cyan-500/15 text-teal-800 shadow-[inset_0_0_20px_rgba(45,212,191,0.08)] dark:text-teal-200',
  tabInactive:
    'rounded-xl bg-[var(--dash-glass-bg)] text-[var(--dash-text-muted)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-text-title)]',
  sectionChip: 'rounded-xl border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-xs text-teal-700 dark:text-teal-300',
  innerPanel: 'rounded-xl border border-[var(--dash-glass-border)] bg-[var(--dash-hover)] p-4',
} as const
