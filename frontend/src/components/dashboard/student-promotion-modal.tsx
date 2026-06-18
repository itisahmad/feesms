'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, GraduationCap } from 'lucide-react';
import {
  getPromotionPreview,
  promoteStudents,
  type PromotionPreview,
  type PromoteStudentsResult,
} from '@/lib/api';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

type PromotionTarget = {
  classId: number;
  className: string;
  sectionId?: number;
  sectionName?: string;
  studentIds?: number[];
};

interface StudentPromotionModalProps {
  target: PromotionTarget;
  onClose: () => void;
  onSuccess: (result: PromoteStudentsResult) => void;
}

export function StudentPromotionModal({ target, onClose, onSuccess }: StudentPromotionModalProps) {
  const [preview, setPreview] = useState<PromotionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [regenerateRollNumbers, setRegenerateRollNumbers] = useState(true);
  const [includedIds, setIncludedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    setError('');
    getPromotionPreview({
      class: target.classId,
      section: target.sectionId,
    })
      .then(({ data }) => {
        setPreview(data);
        const ids = new Set<number>();
        const pool = target.studentIds?.length
          ? data.students.filter((s) => target.studentIds!.includes(s.id))
          : data.students;
        pool.forEach((s) => ids.add(s.id));
        setIncludedIds(ids);
      })
      .catch(() => setError('Could not load promotion preview.'))
      .finally(() => setLoading(false));
  }, [target.classId, target.sectionId, target.studentIds]);

  const studentsToShow = useMemo(() => {
    if (!preview) return [];
    if (target.studentIds?.length) {
      return preview.students.filter((s) => target.studentIds!.includes(s.id));
    }
    return preview.students;
  }, [preview, target.studentIds]);

  const includedStudents = studentsToShow.filter((s) => includedIds.has(s.id));
  const excludedCount = studentsToShow.length - includedStudents.length;
  const promotableIncluded = includedStudents.filter((s) => !s.will_graduate).length;
  const graduatingIncluded = includedStudents.filter((s) => s.will_graduate).length;

  const toggleStudent = (id: number) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      setIncludedIds(new Set(studentsToShow.map((s) => s.id)));
    } else {
      setIncludedIds(new Set());
    }
  };

  const handlePromote = async () => {
    if (!preview || includedIds.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const excludeIds = studentsToShow
        .filter((s) => !includedIds.has(s.id))
        .map((s) => s.id);
      const { data } = await promoteStudents({
        school_class_id: target.classId,
        section_id: target.sectionId,
        student_ids: target.studentIds?.length ? Array.from(includedIds) : undefined,
        exclude_student_ids: excludeIds.length ? excludeIds : undefined,
        regenerate_roll_numbers: regenerateRollNumbers,
        academic_year: preview.academic_year,
      });
      onSuccess(data);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Promotion failed. Try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const fromLabel = target.sectionName
    ? `${target.className} · Section ${target.sectionName}`
    : target.className;

  return (
    <DashboardModal
      title="Promote students"
      subtitle={`Move students from ${fromLabel} to the next class for session ${preview?.academic_year || '…'}`}
      onClose={onClose}
      wide
    >
      {loading ? (
        <p className="text-sm text-slate-400">Loading preview…</p>
      ) : error && !preview ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : preview ? (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">From</p>
              <p className="mt-1 font-medium text-slate-100">{fromLabel}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">To</p>
              {preview.to_class ? (
                <p className="mt-1 font-medium text-teal-300">
                  {preview.to_class.name}
                  {preview.to_section ? ` · Section ${preview.to_section.name}` : ''}
                </p>
              ) : (
                <p className="mt-1 flex items-center gap-1.5 font-medium text-amber-300">
                  <GraduationCap className="h-4 w-4" />
                  Final class — students will be marked graduated
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-200">
                Select students to promote
                <span className="ml-2 font-normal text-slate-500">
                  ({includedIds.size} of {studentsToShow.length} selected)
                </span>
              </p>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={includedIds.size === studentsToShow.length && studentsToShow.length > 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="rounded border-white/20 bg-white/5"
                />
                All
              </label>
            </div>
            <p className="mb-3 text-xs text-slate-500">
              Uncheck students who should stay back (failed, fees pending, or other reason).
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10">
              {studentsToShow.map((student) => {
                const checked = includedIds.has(student.id);
                return (
                  <label
                    key={student.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0',
                      checked ? 'bg-teal-500/5' : 'bg-transparent',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStudent(student.id)}
                      className="rounded border-white/20 bg-white/5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-100">{student.name}</span>
                      {student.roll_number ? (
                        <span className="ml-2 text-xs text-slate-500">Roll {student.roll_number}</span>
                      ) : null}
                      {student.section_name && !target.sectionId ? (
                        <span className="ml-2 text-xs text-slate-500">Sec {student.section_name}</span>
                      ) : null}
                    </span>
                    {student.will_graduate ? (
                      <span className="shrink-0 text-xs text-amber-400">Graduate</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={regenerateRollNumbers}
              onChange={(e) => setRegenerateRollNumbers(e.target.checked)}
              className="mt-0.5 rounded border-white/20 bg-white/5"
            />
            <span>
              Assign new roll numbers in the promoted class
              <span className="block text-xs text-slate-500">Recommended at the start of a new session.</span>
            </span>
          </label>

          {includedIds.size > 0 ? (
            <p className="rounded-lg border border-teal-500/20 bg-teal-500/10 px-3 py-2 text-sm text-teal-100">
              {promotableIncluded > 0
                ? `${promotableIncluded} student(s) will move to ${preview.to_class?.name || 'next class'}.`
                : null}
              {promotableIncluded > 0 && graduatingIncluded > 0 ? ' ' : null}
              {graduatingIncluded > 0
                ? `${graduatingIncluded} will be marked graduated (no higher class).`
                : null}
              {excludedCount > 0 ? ` ${excludedCount} will stay in ${fromLabel}.` : null}
            </p>
          ) : (
            <p className="text-sm text-amber-400">Select at least one student to promote.</p>
          )}

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-white/15 bg-white/5">
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || includedIds.size === 0}
              onClick={handlePromote}
              className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
            >
              {saving ? (
                'Promoting…'
              ) : (
                <>
                  <ArrowUpRight className="mr-1.5 h-4 w-4" />
                  Promote {includedIds.size} student{includedIds.size === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </DashboardModal>
  );
}
