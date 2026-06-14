'use client';

import { useEffect, useState } from 'react';
import { getStudentExamReport, type StudentExamReportResponse } from '@/lib/api';
import { DashboardModal } from '@/components/dashboard/modal';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import { formatApiError } from '@/lib/api-errors';

type StudentResultReportModalProps = {
  examId: number;
  examName: string;
  studentId: number;
  studentName: string;
  onClose: () => void;
  fetchReport?: (examId: number, studentId: number) => Promise<{ data: StudentExamReportResponse }>;
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function StudentResultReportModal({
  examId,
  examName,
  studentId,
  studentName,
  onClose,
  fetchReport,
}: StudentResultReportModalProps) {
  const [report, setReport] = useState<StudentExamReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const load = fetchReport ?? getStudentExamReport;
    load(examId, studentId)
      .then(({ data }) => setReport(data))
      .catch((err) => {
        setReport(null);
        setError(formatApiError(err));
      })
      .finally(() => setLoading(false));
  }, [examId, studentId, fetchReport]);

  const subjectNames = new Map(report?.subjects.map((s) => [s.id, s.name]) ?? []);

  return (
    <DashboardModal
      title={examName}
      subtitle={`Result card — ${studentName}`}
      wide
      onClose={onClose}
    >
      {loading ? (
        <InlineLoading message="Loading result…" />
      ) : error ? (
        <p className={dash.error}>{error}</p>
      ) : !report ? (
        <p className={dash.empty}>No result data.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 text-sm text-[var(--dash-text-muted)]">
            <span>Class: {report.student.class_name}</span>
            {report.student.roll_number && <span>Roll: {report.student.roll_number}</span>}
            <span>Exam date: {formatDate(report.exam.exam_date)}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--dash-glass-border)]">
            <table className={dash.table}>
              <thead className={dash.thead}>
                <tr>
                  <th className={dash.th}>Subject</th>
                  <th className={cn(dash.th, 'text-center')}>Marks</th>
                  <th className={cn(dash.th, 'text-center')}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {report.marks.map((m) => (
                  <tr key={m.class_subject_id} className={dash.tr}>
                    <td className={dash.td}>
                      {subjectNames.get(m.class_subject_id) ?? 'Subject'}
                    </td>
                    <td className={cn(dash.td, 'text-center')}>
                      {m.is_absent
                        ? 'AB'
                        : m.marks_obtained != null
                          ? `${m.marks_obtained} / ${m.max_marks}`
                          : '—'}
                    </td>
                    <td className={cn(dash.td, 'text-center font-medium')}>{m.grade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-4 rounded-xl border border-teal-500/25 bg-teal-500/10 px-4 py-3">
            <div className="text-sm text-[var(--dash-text-muted)]">
              Total:{' '}
              <span className="font-semibold text-[var(--dash-text-title)]">
                {report.total_obtained != null
                  ? `${report.total_obtained} / ${report.total_max}`
                  : '—'}
              </span>
            </div>
            {report.percentage != null && (
              <div className="text-sm text-[var(--dash-text-muted)]">
                Percentage:{' '}
                <span className="font-semibold text-[var(--dash-text-title)]">{report.percentage}%</span>
              </div>
            )}
            <span className={cn(dash.badge, dash.badgeTeal, 'px-3 py-1 text-base')}>
              Grade: {report.overall_grade || '—'}
            </span>
          </div>
        </div>
      )}
    </DashboardModal>
  );
}
