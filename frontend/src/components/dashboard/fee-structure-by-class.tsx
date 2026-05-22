'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, GraduationCap, Layers } from 'lucide-react';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

export type FeeStructureRow = {
  id: number;
  fee_type: number;
  fee_type_name: string;
  school_class: number | null;
  class_name: string;
  amount: string;
  billing_period_display?: string;
  fee_type_billing_period?: string;
  due_day: number;
  late_fine_per_day: string;
  academic_year: string;
  allow_yearly_payment?: boolean;
  yearly_discount_percent?: number;
  is_locked?: boolean;
};

type SchoolClass = { id: number; name: string };

type ClassGroup = {
  key: string;
  classId: number | null;
  className: string;
  fees: FeeStructureRow[];
};

const BILLING_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One-Time Payment' },
] as const;

function periodLabel(s: FeeStructureRow): string {
  return (
    s.billing_period_display ||
    BILLING_PERIODS.find((p) => p.value === s.fee_type_billing_period)?.label ||
    s.fee_type_billing_period ||
    '—'
  );
}

function buildClassGroups(structures: FeeStructureRow[], classes: SchoolClass[]): ClassGroup[] {
  const bucket = new Map<string, FeeStructureRow[]>();

  const add = (key: string, row: FeeStructureRow) => {
    const list = bucket.get(key) ?? [];
    list.push(row);
    bucket.set(key, list);
  };

  for (const s of structures) {
    const key = s.school_class != null ? `class-${s.school_class}` : 'school-wide';
    add(key, s);
  }

  const groups: ClassGroup[] = [];
  const seen = new Set<string>();

  for (const c of classes) {
    const key = `class-${c.id}`;
    const fees = bucket.get(key);
    if (!fees?.length) continue;
    seen.add(key);
    groups.push({
      key,
      classId: c.id,
      className: c.name,
      fees: [...fees].sort((a, b) => a.fee_type_name.localeCompare(b.fee_type_name)),
    });
  }

  for (const [key, fees] of bucket) {
    if (seen.has(key) || !fees.length) continue;
    const classId = key.startsWith('class-') ? parseInt(key.slice(6), 10) : null;
    groups.push({
      key,
      classId: Number.isNaN(classId as number) ? null : classId,
      className: key === 'school-wide' ? 'School-wide' : fees[0]?.class_name || 'Other',
      fees: [...fees].sort((a, b) => a.fee_type_name.localeCompare(b.fee_type_name)),
    });
  }

  return groups;
}

type FeeStructureByClassProps = {
  structures: FeeStructureRow[];
  classes: SchoolClass[];
  searchQuery: string;
  formatAcademicYear: (value: string) => string;
  onEdit: (row: FeeStructureRow) => void;
  onDelete: (id: number) => void;
};

export function FeeStructureByClass({
  structures,
  classes,
  searchQuery,
  formatAcademicYear,
  onEdit,
  onDelete,
}: FeeStructureByClassProps) {
  const groups = useMemo(() => buildClassGroups(structures, classes), [structures, classes]);

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!searchQuery.trim()) return;
    setExpandedKeys(new Set(groups.map((g) => g.key)));
  }, [searchQuery, groups]);

  const toggle = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!groups.length) {
    return null;
  }

  return (
    <div className="divide-y divide-white/5">
      {groups.map((group, gi) => {
        const isExpanded = expandedKeys.has(group.key);
        const isSchoolWide = group.key === 'school-wide';

        return (
          <motion.div
            key={group.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 + gi * 0.03 }}
          >
            <button
              type="button"
              onClick={() => toggle(group.key)}
              aria-expanded={isExpanded}
              className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white/[0.04] sm:px-6"
            >
              <ChevronDown
                className={cn(
                  'h-5 w-5 shrink-0 text-slate-500 transition-transform',
                  isExpanded && 'rotate-180'
                )}
                aria-hidden
              />
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1',
                  isSchoolWide
                    ? 'bg-cyan-500/15 ring-cyan-400/25'
                    : 'bg-teal-500/20 ring-teal-400/30'
                )}
              >
                {isSchoolWide ? (
                  <Layers className="h-5 w-5 text-cyan-300" />
                ) : (
                  <GraduationCap className="h-5 w-5 text-teal-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-base font-semibold text-white sm:text-lg">{group.className}</span>
                <p className="mt-0.5 text-xs text-slate-500">
                  {group.fees.length} fee type{group.fees.length === 1 ? '' : 's'}
                  {!isExpanded ? ' · Click to view' : ''}
                </p>
              </div>
              <span className={cn(dash.badge, dash.badgeTeal, 'shrink-0')}>{group.fees.length}</span>
            </button>

            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-white/5 bg-white/[0.02] px-2 pb-4 sm:px-4">
                    <div className="overflow-x-auto">
                      <table className={dash.table}>
                        <thead className={dash.thead}>
                          <tr>
                            <th className={dash.th}>Fee type</th>
                            <th className={dash.th}>Amount</th>
                            <th className={dash.th}>Period</th>
                            <th className={dash.th}>Due day</th>
                            <th className={dash.th}>Late fine/day</th>
                            <th className={dash.th}>Academic year</th>
                            <th className={dash.th}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.fees.map((s) => (
                            <tr key={s.id} className={dash.tr}>
                              <td className={cn(dash.td, 'font-medium text-[var(--dash-text-title)]')}>
                                {s.fee_type_name}
                              </td>
                              <td className={dash.td}>₹{parseFloat(s.amount).toLocaleString('en-IN')}</td>
                              <td className={dash.td}>{periodLabel(s)}</td>
                              <td className={dash.td}>{s.due_day}</td>
                              <td className={dash.td}>
                                ₹{parseFloat(s.late_fine_per_day || '0').toLocaleString('en-IN')}
                              </td>
                              <td className={dash.td}>{formatAcademicYear(s.academic_year)}</td>
                              <td className={dash.td}>
                                {s.is_locked ? (
                                  <span className="text-xs text-amber-400">Linked to students – cannot edit</span>
                                ) : (
                                  <div className="flex gap-2">
                                    <button type="button" onClick={() => onEdit(s)} className={dash.link}>
                                      Edit
                                    </button>
                                    <button type="button" onClick={() => onDelete(s.id)} className={dash.linkDanger}>
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}
