'use client';

import Link from 'next/link';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import type { StudentPublishedResultSummary } from './types';
import { formatExamDate } from './utils';

type StudentResultsSectionProps = {
  results: StudentPublishedResultSummary[];
  loading?: boolean;
  readOnly?: boolean;
  onOpenExam?: (examId: number, examName: string) => void;
};

export function StudentResultsSection({
  results,
  loading = false,
  readOnly = false,
  onOpenExam,
}: StudentResultsSectionProps) {
  if (!loading && results.length === 0) return null;

  return (
    <GlassCard delay={0.1}>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-teal-400" />
            <h2 className="text-sm font-semibold text-white">Exam results</h2>
          </div>
          {!readOnly ? (
            <Link href="/dashboard/results" className={cn(dash.link, 'text-[11px]')}>
              Manage
            </Link>
          ) : null}
        </div>
      </div>
      <div className="divide-y divide-white/5">
        {loading ? (
          <div className="p-4">
            <InlineLoading message="Loading…" />
          </div>
        ) : (
          results.map((exam) => (
            <button
              key={exam.exam_id}
              type="button"
              onClick={() => onOpenExam?.(exam.exam_id, exam.exam_name)}
              disabled={!onOpenExam}
              className={cn(
                'flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition',
                onOpenExam && 'hover:bg-white/[0.03]',
                !onOpenExam && 'cursor-default',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-200">{exam.exam_name}</p>
                <p className="text-[11px] text-slate-500">
                  {exam.class_name}
                  {exam.exam_date ? ` · ${formatExamDate(exam.exam_date)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {exam.percentage != null ? (
                  <span className="text-sm font-semibold text-teal-300">{exam.percentage}%</span>
                ) : null}
                {exam.overall_grade ? (
                  <span className={cn(dash.badge, dash.badgeTeal, 'text-[10px]')}>{exam.overall_grade}</span>
                ) : null}
                {onOpenExam ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : null}
              </div>
            </button>
          ))
        )}
      </div>
    </GlassCard>
  );
}

/** @deprecated Use StudentProfileOverview + StudentProfileHeader instead */
export function StudentPerformanceSection({
  results,
  loading = false,
}: {
  results: StudentPublishedResultSummary[];
  loading?: boolean;
}) {
  if (loading || !results.length) return null;
  return null;
}
