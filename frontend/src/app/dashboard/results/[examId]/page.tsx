'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ClipboardCheck, Save, Send, RotateCcw, RefreshCw } from 'lucide-react';
import {
  getExamMarksheet,
  saveExamMarks,
  publishExam,
  unpublishExam,
  initializeExamMarks,
  type ExamMarksheetResponse,
  type ExamMarksheetStudent,
  type BulkMarkEntry,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { usePermissions } from '@/hooks/use-permissions';
import { formatApiError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

type CellKey = string;

type CellDraft = {
  marks_obtained: string;
  is_absent: boolean;
};

function cellKey(studentId: number, subjectId: number): CellKey {
  return `${studentId}-${subjectId}`;
}

function buildDraftFromSheet(sheet: ExamMarksheetResponse): Record<CellKey, CellDraft> {
  const draft: Record<CellKey, CellDraft> = {};
  for (const student of sheet.students) {
    for (const mark of student.marks) {
      draft[cellKey(student.student_id, mark.class_subject_id)] = {
        marks_obtained: mark.marks_obtained ?? '',
        is_absent: mark.is_absent,
      };
    }
  }
  return draft;
}

function buildPayload(
  students: ExamMarksheetStudent[],
  draft: Record<CellKey, CellDraft>,
): BulkMarkEntry[] {
  const entries: BulkMarkEntry[] = [];
  for (const student of students) {
    for (const mark of student.marks) {
      const key = cellKey(student.student_id, mark.class_subject_id);
      const cell = draft[key];
      if (!cell) continue;
      entries.push({
        student_id: student.student_id,
        class_subject_id: mark.class_subject_id,
        marks_obtained: cell.is_absent ? null : cell.marks_obtained || null,
        is_absent: cell.is_absent,
      });
    }
  }
  return entries;
}

export default function ExamMarksheetPage() {
  const params = useParams();
  const examId = Number(params.examId);
  const { canEdit: canEditModule, canAct } = usePermissions();

  const [sheet, setSheet] = useState<ExamMarksheetResponse | null>(null);
  const [draft, setDraft] = useState<Record<CellKey, CellDraft>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isPublished = sheet?.exam.status === 'published';
  const canEdit = canEditModule('results') && !isPublished;

  const load = useCallback(() => {
    if (!examId || Number.isNaN(examId)) return;
    setLoading(true);
    setError('');
    getExamMarksheet(examId)
      .then(({ data }) => {
        setSheet(data);
        setDraft(buildDraftFromSheet(data));
      })
      .catch((err) => {
        setSheet(null);
        setError(formatApiError(err));
      })
      .finally(() => setLoading(false));
  }, [examId]);

  useEffect(() => {
    load();
  }, [load]);

  const subjects = sheet?.subjects ?? [];
  const students = sheet?.students ?? [];

  const gradeMap = useMemo(() => {
    const map = new Map<CellKey, string>();
    if (!sheet) return map;
    for (const student of sheet.students) {
      for (const mark of student.marks) {
        map.set(cellKey(student.student_id, mark.class_subject_id), mark.grade);
      }
    }
    return map;
  }, [sheet]);

  const updateCell = (studentId: number, subjectId: number, patch: Partial<CellDraft>) => {
    const key = cellKey(studentId, subjectId);
    setDraft((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const handleSave = async () => {
    if (!sheet || !canEdit) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const marks = buildPayload(students, draft);
      await saveExamMarks(examId, marks);
      setSuccess('Marks saved.');
      load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!canAct('results')) return;
    setSaving(true);
    setError('');
    try {
      await saveExamMarks(examId, buildPayload(students, draft));
      await publishExam(examId);
      setSuccess('Result published.');
      load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!canAct('results')) return;
    setSaving(true);
    setError('');
    try {
      await unpublishExam(examId);
      setSuccess('Reopened as draft — you can edit marks again.');
      load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleInitialize = async () => {
    if (!canEditModule('results')) return;
    setSaving(true);
    setError('');
    try {
      await initializeExamMarks(examId);
      load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <InlineLoading message="Loading marksheet…" />
      </PageShell>
    );
  }

  if (!sheet) {
    return (
      <PageShell>
        <Link href="/dashboard/results" className={cn(dash.link, 'mb-4 inline-flex items-center gap-1')}>
          <ArrowLeft className="h-4 w-4" />
          Back to results
        </Link>
        <p className={dash.error}>{error || 'Exam not found.'}</p>
      </PageShell>
    );
  }

  const { exam } = sheet;

  return (
    <PageShell>
      <Link href="/dashboard/results" className={cn(dash.link, 'mb-4 inline-flex items-center gap-1')}>
        <ArrowLeft className="h-4 w-4" />
        All exams
      </Link>

      <PageHeader
        icon={ClipboardCheck}
        title={exam.name}
        subtitle={`${exam.class_name} · Max ${exam.max_marks} per subject${exam.exam_date ? ` · ${exam.exam_date}` : ''}`}
        actions={
          <motion.div className="flex flex-wrap gap-2">
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  onClick={handleInitialize}
                  disabled={saving}
                  className="gap-2 rounded-xl border-[var(--dash-glass-border)] bg-[var(--dash-hover)] text-[var(--dash-text-body)] hover:bg-[var(--dash-glass-bg-strong)] hover:text-[var(--dash-text-title)]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Sync rows
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2 rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving…' : 'Save marks'}
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={saving}
                  className="gap-2 rounded-xl border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Publish
                </Button>
              </>
            )}
            {canAct('results') && isPublished && (
              <Button
                variant="outline"
                onClick={handleUnpublish}
                disabled={saving}
                className="gap-2 rounded-xl border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 hover:text-amber-100"
              >
                <RotateCcw className="h-4 w-4" />
                Reopen draft
              </Button>
            )}
          </motion.div>
        }
      />

      <motion.div className="mb-4 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            dash.badge,
            isPublished
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
          )}
        >
          {isPublished ? 'Published' : 'Draft'}
        </span>
        {isPublished && (
          <span className="text-sm text-[var(--dash-text-muted)]">Marks are read-only until reopened.</span>
        )}
      </motion.div>

      {error && <p className={cn(dash.error, 'mb-4')}>{error}</p>}
      {success && <p className={cn(dash.success, 'mb-4')}>{success}</p>}

      {!sheet.has_subjects && (
        <GlassCard className="mb-4">
          <p className={dash.warn}>
            This class has no subjects yet. Add subjects under{' '}
            <Link href="/dashboard/classes" className="font-medium underline">
              Classes
            </Link>{' '}
            before entering marks.
          </p>
        </GlassCard>
      )}

      {!sheet.has_students && (
        <GlassCard className="mb-4">
          <p className={dash.warn}>
            No active students in this class. Add students first, then use &quot;Sync rows&quot; to create mark
            entries.
          </p>
        </GlassCard>
      )}

      <GlassCard>
        {subjects.length === 0 || students.length === 0 ? (
          <p className={dash.empty}>Marksheet will appear when the class has subjects and students.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={cn(dash.table, 'min-w-[720px]')}>
              <thead className={dash.thead}>
                <tr>
                  <th className={cn(dash.th, 'sticky left-0 z-10 bg-[var(--dash-card-bg)]')}>Student</th>
                  {subjects.map((s) => (
                    <th key={s.id} className={cn(dash.th, 'text-center min-w-[100px]')}>
                      {s.name}
                    </th>
                  ))}
                  <th className={cn(dash.th, 'text-center')}>Total</th>
                  <th className={cn(dash.th, 'text-center')}>%</th>
                  <th className={cn(dash.th, 'text-center')}>Grade</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.student_id} className={dash.tr}>
                    <td className={cn(dash.td, 'sticky left-0 z-10 bg-[var(--dash-card-bg)] font-medium')}>
                      <div>{student.student_name}</div>
                      {student.roll_number && (
                        <motion.div className="text-xs text-[var(--dash-text-muted)]">Roll {student.roll_number}</motion.div>
                      )}
                    </td>
                    {student.marks.map((mark) => {
                      const key = cellKey(student.student_id, mark.class_subject_id);
                      const cell = draft[key];
                      const grade = gradeMap.get(key);
                      return (
                        <td key={mark.class_subject_id} className={cn(dash.td, 'text-center align-top')}>
                          {canEdit ? (
                            <motion.div className="flex flex-col items-center gap-1">
                              <input
                                type="number"
                                min={0}
                                max={Number(exam.max_marks)}
                                step="0.01"
                                className={cn(dash.fieldSm, 'w-20 text-center')}
                                value={cell?.is_absent ? '' : cell?.marks_obtained ?? ''}
                                disabled={cell?.is_absent}
                                onChange={(e) =>
                                  updateCell(student.student_id, mark.class_subject_id, {
                                    marks_obtained: e.target.value,
                                    is_absent: false,
                                  })
                                }
                                placeholder="—"
                              />
                              <label className="flex items-center gap-1 text-xs text-[var(--dash-text-muted)]">
                                <input
                                  type="checkbox"
                                  checked={cell?.is_absent ?? false}
                                  onChange={(e) =>
                                    updateCell(student.student_id, mark.class_subject_id, {
                                      is_absent: e.target.checked,
                                      marks_obtained: e.target.checked ? '' : cell?.marks_obtained ?? '',
                                    })
                                  }
                                />
                                AB
                              </label>
                            </motion.div>
                          ) : (
                            <motion.div>
                              <motion.div className="font-medium">
                                {mark.is_absent ? 'AB' : mark.marks_obtained ?? '—'}
                              </motion.div>
                              {grade && !mark.is_absent && (
                                <motion.div className="text-xs text-[var(--dash-text-muted)]">{grade}</motion.div>
                              )}
                            </motion.div>
                          )}
                        </td>
                      );
                    })}
                    <td className={cn(dash.td, 'text-center font-medium')}>
                      {student.total_obtained != null ? `${student.total_obtained}/${student.total_max}` : '—'}
                    </td>
                    <td className={cn(dash.td, 'text-center')}>
                      {student.percentage != null ? `${student.percentage}%` : '—'}
                    </td>
                    <td className={cn(dash.td, 'text-center font-semibold')}>
                      {student.overall_grade || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
