'use client';

import {
  ArrowRight,
  CalendarDays,
  IndianRupee,
  MessageCircle,
  User,
} from 'lucide-react';
import { GlassCard } from '@/components/dashboard/page-shell';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import type { StudentFeeSummary, StudentProfileStudent, StudentPublishedResultSummary } from './types';
import { computePerformanceSummary, feePaidPercent, formatProfileDate } from './utils';

type StudentProfileHeaderProps = {
  student: StudentProfileStudent;
  admissionDate: string | null;
  feeSummary: StudentFeeSummary;
  publishedResults?: StudentPublishedResultSummary[];
  readOnly?: boolean;
  onViewFees?: () => void;
};

function studentInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function StudentProfileHeader({
  student,
  admissionDate,
  feeSummary,
  publishedResults = [],
  onViewFees,
}: StudentProfileHeaderProps) {
  const performance = computePerformanceSummary(publishedResults);
  const paidPercent = feePaidPercent(feeSummary);
  const feeStatus =
    feeSummary.totalPending <= 0 ? 'Paid' : feeSummary.totalPaid > 0 ? 'Partial' : 'Pending';
  const feeStatusClass =
    feeSummary.totalPending <= 0
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : feeSummary.totalPaid > 0
        ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
        : 'border-rose-500/30 bg-rose-500/10 text-rose-300';

  return (
    <GlassCard delay={0.04}>
      <div className="p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/15 to-violet-500/10 text-lg font-bold text-teal-100">
              {studentInitials(student.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-white">{student.name}</h1>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  Active
                </span>
              </div>
              <p className="mt-0.5 text-sm text-slate-400">
                {student.class_name}
                {student.roll_number ? ` · Roll ${student.roll_number}` : ''}
                {student.admission_number ? ` · ${student.admission_number}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  Admitted {formatProfileDate(admissionDate)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {student.parent_name || 'Parent'} · {student.parent_phone}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            {performance?.latestGrade ? (
              <div className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-violet-300/70">Grade</p>
                <p className="text-lg font-bold leading-tight text-white">{performance.latestGrade}</p>
              </div>
            ) : null}
            <div className="rounded-lg border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-teal-300/70">Avg score</p>
              <p className="text-lg font-bold leading-tight text-white">
                {performance?.averagePercentage != null ? `${performance.averagePercentage}%` : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Exams</p>
              <p className="text-lg font-bold leading-tight text-white">{performance?.examCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-teal-400" />
              <span className="text-sm font-medium text-slate-200">Fees</span>
              <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-medium', feeStatusClass)}>
                {feeStatus}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
              <span>
                Paid <strong className="text-teal-300">₹{feeSummary.totalPaid.toLocaleString('en-IN')}</strong>
              </span>
              <span>
                Due <strong className="text-slate-200">₹{feeSummary.totalDue.toLocaleString('en-IN')}</strong>
              </span>
              {feeSummary.totalPending > 0 ? (
                <span className="text-amber-300">
                  Pending ₹{feeSummary.totalPending.toLocaleString('en-IN')}
                </span>
              ) : null}
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/8">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                feeSummary.totalPending > 0 ? 'bg-amber-400' : 'bg-teal-400',
              )}
              style={{ width: `${paidPercent}%` }}
            />
          </div>
          {onViewFees ? (
            <button
              type="button"
              onClick={onViewFees}
              className={cn(dash.link, 'mt-2 inline-flex items-center gap-1 text-xs')}
            >
              View payments & receipts
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        {student.class_whatsapp_group_link ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <MessageCircle className="h-4 w-4 text-emerald-400" />
              {student.class_whatsapp_group_name || `${student.class_name} WhatsApp`}
            </div>
            <a
              href={student.class_whatsapp_group_link}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(dash.link, 'text-xs')}
            >
              Join group
            </a>
          </div>
        ) : null}
      </div>
    </GlassCard>
  );
}
