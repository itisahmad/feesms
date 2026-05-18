'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ClipboardCheck, Plus, Trash2, ChevronRight, Settings2 } from 'lucide-react';
import {
  getExams,
  createExam,
  deleteExam,
  getClasses,
  type ExamResultListItem,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { usePermissions } from '@/hooks/use-permissions';
import { formatApiError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

interface SchoolClass {
  id: number;
  name: string;
}

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const getInitialForm = () => ({
  name: '',
  school_class: '',
  exam_date: '',
  max_marks: '100',
});

export default function ResultsPage() {
  const { canCreate, canDelete } = usePermissions();
  const [exams, setExams] = useState<ExamResultListItem[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(getInitialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    const params: { school_class?: number; status?: string } = {};
    if (filterClass) params.school_class = Number(filterClass);
    if (filterStatus) params.status = filterStatus;
    getExams(params)
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : data.results ?? [];
        setExams(list);
      })
      .catch(() => setExams([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    getClasses()
      .then(({ data }) => setClasses(data.results || data))
      .catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    load();
  }, [filterClass, filterStatus]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canCreate('results')) return;
    setSaving(true);
    setError('');
    try {
      await createExam({
        name: form.name.trim(),
        school_class: Number(form.school_class),
        exam_date: form.exam_date || null,
        max_marks: form.max_marks || '100',
      });
      setShowForm(false);
      setForm(getInitialForm());
      load();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (exam: ExamResultListItem) => {
    if (!canDelete('results')) return;
    if (!window.confirm(`Delete "${exam.name}" for ${exam.class_name}?`)) return;
    try {
      await deleteExam(exam.id);
      load();
    } catch (err) {
      alert(formatApiError(err));
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={ClipboardCheck}
        title="Exam results"
        subtitle="Create exams per class, enter marks from assigned subjects, and publish result sheets."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/results/settings">
              <Button
                variant="outline"
                className="gap-2 rounded-xl border-[var(--dash-glass-border)] bg-[var(--dash-hover)] text-[var(--dash-text-body)] hover:bg-[var(--dash-glass-bg-strong)] hover:text-[var(--dash-text-title)]"
              >
                <Settings2 className="h-4 w-4" />
                Grading rules
              </Button>
            </Link>
            {canCreate('results') && (
              <Button
                onClick={() => setShowForm(true)}
                className="gap-2 rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400"
              >
                <Plus className="h-4 w-4" />
                New exam
              </Button>
            )}
          </div>
        }
      />

      <GlassCard className="mb-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap gap-4"
        >
          <motion.div className="min-w-[180px] flex-1">
            <label className={dash.label}>Class</label>
            <DashboardSelect
              value={filterClass}
              onChange={setFilterClass}
              allowEmpty
              emptyLabel="All classes"
              placeholder="All classes"
              options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
            />
          </motion.div>
          <motion.div className="min-w-[160px] flex-1">
            <label className={dash.label}>Status</label>
            <DashboardSelect
              value={filterStatus}
              onChange={setFilterStatus}
              allowEmpty
              emptyLabel="All"
              placeholder="All statuses"
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
              ]}
            />
          </motion.div>
        </motion.div>
      </GlassCard>

      <GlassCard>
        {loading ? (
          <InlineLoading message="Loading exams…" />
        ) : exams.length === 0 ? (
          <p className={dash.empty}>No exams yet. Create one to start entering marks.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={dash.table}>
              <thead className={dash.thead}>
                <tr>
                  <th className={dash.th}>Exam</th>
                  <th className={dash.th}>Class</th>
                  <th className={dash.th}>Date</th>
                  <th className={dash.th}>Max marks</th>
                  <th className={dash.th}>Students</th>
                  <th className={dash.th}>Status</th>
                  <th className={dash.th} />
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam.id} className={dash.tr}>
                    <td className={dash.td}>
                      <Link
                        href={`/dashboard/results/${exam.id}`}
                        className="font-medium text-[var(--dash-text-title)] hover:text-teal-500"
                      >
                        {exam.name}
                      </Link>
                    </td>
                    <td className={dash.td}>{exam.class_name}</td>
                    <td className={dash.td}>{formatDate(exam.exam_date)}</td>
                    <td className={dash.td}>{exam.max_marks}</td>
                    <td className={dash.td}>{exam.students_count}</td>
                    <td className={dash.td}>
                      <span
                        className={cn(
                          dash.badge,
                          exam.status === 'published'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                        )}
                      >
                        {exam.status === 'published' ? 'Published' : 'Draft'}
                      </span>
                    </td>
                    <td className={dash.td}>
                      <motion.div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/dashboard/results/${exam.id}`}
                          className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-500 dark:text-teal-400"
                        >
                          Enter marks
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                        {canDelete('results') && (
                          <button
                            type="button"
                            onClick={() => handleDelete(exam)}
                            className="rounded-lg p-2 text-red-500 transition hover:bg-red-500/10"
                            aria-label="Delete exam"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </motion.div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {showForm && (
      <DashboardModal
        onClose={() => {
          setShowForm(false);
          setError('');
        }}
        title="New exam"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <p className={dash.error}>{error}</p>}
          <div>
            <label className={dash.label}>Exam name</label>
            <input
              className={dash.field}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Half Yearly 2026"
              required
            />
          </div>
          <motion.div>
            <label className={dash.label}>Class</label>
            <DashboardSelect
              value={form.school_class}
              onChange={(v) => setForm((f) => ({ ...f, school_class: v }))}
              allowEmpty
              emptyLabel="Select class"
              placeholder="Select class"
              options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
            />
          </motion.div>
          <motion.div className="grid grid-cols-2 gap-4">
            <div>
              <label className={dash.label}>Exam date</label>
              <input
                type="date"
                className={dash.field}
                value={form.exam_date}
                onChange={(e) => setForm((f) => ({ ...f, exam_date: e.target.value }))}
              />
            </div>
            <div>
              <label className={dash.label}>Max marks (per subject)</label>
              <input
                type="number"
                min={1}
                step="0.01"
                className={dash.field}
                value={form.max_marks}
                onChange={(e) => setForm((f) => ({ ...f, max_marks: e.target.value }))}
                required
              />
            </div>
          </motion.div>
          <motion.div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowForm(false)}
              className="rounded-xl border-[var(--dash-glass-border)] bg-[var(--dash-hover)] text-[var(--dash-text-body)] hover:bg-[var(--dash-glass-bg-strong)] hover:text-[var(--dash-text-title)]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || !form.school_class}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create exam'}
            </Button>
          </motion.div>
        </form>
      </DashboardModal>
      )}
    </PageShell>
  );
}
