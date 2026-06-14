'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { getStudentExamReport, type StudentExamReportResponse } from '@/lib/api';
import { GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import type { StudentPublishedResultSummary } from './types';

const SUBJECT_COLORS = ['#2dd4bf', '#818cf8', '#fbbf24', '#60a5fa', '#f472b6'];

type StudentProfileOverviewProps = {
  studentId: number;
  publishedResults: StudentPublishedResultSummary[];
  resultsLoading?: boolean;
  showResults?: boolean;
  fetchExamReport?: (examId: number, studentId: number) => Promise<{ data: StudentExamReportResponse }>;
  onOpenExam?: (examId: number, examName: string) => void;
};

function SubjectPerformanceBars({
  report,
  loading,
  onOpenExam,
}: {
  report: StudentExamReportResponse | null;
  loading: boolean;
  onOpenExam?: () => void;
}) {
  if (loading) return <InlineLoading message="Loading…" />;
  if (!report?.marks.length) {
    return <p className="py-4 text-center text-xs text-slate-500">No subject marks yet.</p>;
  }

  const subjectMap = new Map(report.subjects.map((s) => [s.id, s.name]));
  const rows = report.marks
    .map((mark, index) => {
      const name = subjectMap.get(mark.class_subject_id) || 'Subject';
      const obtained = parseFloat(mark.marks_obtained || '0');
      const max = parseFloat(mark.max_marks || '0');
      const pct = max > 0 && !mark.is_absent ? Math.round((obtained / max) * 100) : 0;
      return { name, pct, color: SUBJECT_COLORS[index % SUBJECT_COLORS.length] };
    })
    .filter((row) => row.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  if (!rows.length) {
    return <p className="py-4 text-center text-xs text-slate-500">No subject marks yet.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.name} className="flex items-center gap-2">
          <span className="w-20 shrink-0 truncate text-xs text-slate-400">{row.name}</span>
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/8">
            <div
              className="h-full rounded-full"
              style={{ width: `${row.pct}%`, backgroundColor: row.color }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-slate-300">{row.pct}%</span>
        </div>
      ))}
      {onOpenExam ? (
        <button type="button" onClick={onOpenExam} className={cn(dash.link, 'mt-1 inline-flex items-center gap-1 text-xs')}>
          Full report
          <ArrowRight className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

export function StudentProfileOverview({
  studentId,
  publishedResults,
  resultsLoading = false,
  showResults = true,
  fetchExamReport,
  onOpenExam,
}: StudentProfileOverviewProps) {
  const [subjectReport, setSubjectReport] = useState<StudentExamReportResponse | null>(null);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const latestExam = publishedResults[0];

  useEffect(() => {
    if (!showResults || !latestExam || !studentId) {
      setSubjectReport(null);
      return;
    }
    setSubjectLoading(true);
    const load = fetchExamReport ?? getStudentExamReport;
    load(latestExam.exam_id, studentId)
      .then(({ data }) => setSubjectReport(data))
      .catch(() => setSubjectReport(null))
      .finally(() => setSubjectLoading(false));
  }, [showResults, latestExam?.exam_id, studentId, fetchExamReport]);

  if (!showResults || (!resultsLoading && !latestExam)) return null;

  return (
    <GlassCard delay={0.08}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-violet-400" />
          <div>
            <h2 className="text-sm font-semibold text-white">Latest exam subjects</h2>
            {latestExam ? (
              <p className="text-[11px] text-slate-500">{latestExam.exam_name}</p>
            ) : null}
          </div>
        </div>
        {latestExam?.overall_grade ? (
          <span className={cn(dash.badge, dash.badgeTeal, 'text-[10px]')}>Grade {latestExam.overall_grade}</span>
        ) : null}
      </div>
      <div className="p-4">
        <SubjectPerformanceBars
          report={subjectReport}
          loading={resultsLoading || subjectLoading}
          onOpenExam={
            latestExam && onOpenExam
              ? () => onOpenExam(latestExam.exam_id, latestExam.exam_name)
              : undefined
          }
        />
      </div>
    </GlassCard>
  );
}
