'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, CheckCircle2, BarChart3 } from 'lucide-react';
import {
  createAttendanceSession,
  finalizeAttendanceSession,
  getAttendanceMyClasses,
  getAttendanceSession,
  markAllPresentAttendance,
  updateAttendanceSession,
  type AttendanceClassOption,
  type AttendanceSession,
} from '@/lib/api';
import { AttendanceMarkingTable } from '@/components/attendance/attendance-marking-table';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { useAuth } from '@/contexts/AuthContext';

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AttendancePage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner' || user?.is_owner;
  const [classes, setClasses] = useState<AttendanceClassOption[]>([]);
  const [date, setDate] = useState(todayStr());
  const [classKey, setClassKey] = useState('');
  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<{ student_id: number; student_name: string; roll_number: string; status: string; remark: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getAttendanceMyClasses()
      .then(({ data }) => setClasses(data.classes || []))
      .catch(() => setClasses([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = classes.find((c) => `${c.school_class_id}-${c.section_id}` === classKey);

  const loadSession = async () => {
    if (!selected) return;
    setError('');
    setSaving(true);
    try {
      const { data } = await createAttendanceSession({
        school_class: selected.school_class_id,
        section: selected.section_id,
        date,
      });
      setSession(data);
      setRecords(
        (data.records || []).map((r) => ({
          student_id: r.student_id,
          student_name: r.student_name,
          roll_number: r.roll_number,
          status: r.status,
          remark: r.remark || '',
        })),
      );
    } catch {
      setError('Could not load attendance for this class.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordChange = (studentId: number, patch: { status?: string; remark?: string }) => {
    setRecords((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)),
    );
  };

  const saveDraft = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const { data } = await updateAttendanceSession(session.id, {
        records: records.map((r) => ({
          student_id: r.student_id,
          status: r.status,
          remark: r.remark,
        })),
      });
      setSession(data);
      alert('Attendance saved.');
    } catch {
      alert('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAllPresent = async () => {
    if (!session) return;
    setSaving(true);
    try {
      const { data } = await markAllPresentAttendance(session.id);
      setSession(data);
      setRecords(
        (data.records || []).map((r) => ({
          student_id: r.student_id,
          student_name: r.student_name,
          roll_number: r.roll_number,
          status: r.status,
          remark: r.remark || '',
        })),
      );
    } catch {
      alert('Failed to mark all present.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!session || !confirm('Finalize attendance? Teachers may not be able to edit after this.')) return;
    setSaving(true);
    try {
      await updateAttendanceSession(session.id, {
        records: records.map((r) => ({
          student_id: r.student_id,
          status: r.status,
          remark: r.remark,
        })),
      });
      const { data } = await finalizeAttendanceSession(session.id);
      setSession(data);
      alert('Attendance finalized.');
    } catch {
      alert('Failed to finalize.');
    } finally {
      setSaving(false);
    }
  };

  const readonly = session?.status === 'finalized';

  return (
    <PageShell>
      <PageHeader
        icon={CalendarCheck}
        eyebrow="Daily roster"
        title="Attendance"
        subtitle="Mark present, absent, late, or leave by class and section."
        actions={
          <Link
            href="/dashboard/attendance/reports"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/10"
          >
            <BarChart3 className="h-4 w-4 text-teal-400" />
            Reports
          </Link>
        }
      />

      <GlassCard delay={0.05}>
        <div className="grid gap-4 border-b border-white/10 p-6 md:grid-cols-3">
          <div>
            <label className={dash.label}>Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSession(null);
                setRecords([]);
              }}
              className={dash.field}
            />
          </div>
          <div>
            <label className={dash.label}>Class</label>
            <DashboardSelect
              value={classKey}
              onChange={(v) => {
                setClassKey(v);
                setSession(null);
                setRecords([]);
              }}
              allowEmpty
              emptyLabel="Select class"
              placeholder="Select class"
              options={classes.map((c) => ({
                value: `${c.school_class_id}-${c.section_id}`,
                label: c.label,
              }))}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              disabled={!selected || saving}
              onClick={loadSession}
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
            >
              {saving ? 'Loading…' : 'Load / start'}
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading classes…</p>
        ) : classes.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            No classes available.
            {isOwner ? (
              <>
                {' '}
                <Link href="/dashboard/staff" className="text-teal-400 hover:underline">
                  Assign teachers to classes
                </Link>{' '}
                in Staff.
              </>
            ) : null}
          </p>
        ) : null}

        {error ? <p className="px-6 py-3 text-sm text-red-400">{error}</p> : null}

        {session && records.length > 0 ? (
          <div className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-100">
                  {session.class_name} · Section {session.section_name}
                </h2>
                <p className="text-sm text-slate-500">
                  {session.date} · {session.status === 'finalized' ? 'Finalized' : 'Draft'}
                </p>
              </div>
              {!readonly ? (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={handleMarkAllPresent} disabled={saving} className="rounded-xl border-white/15 bg-white/5">
                    Mark all present
                  </Button>
                  <Button type="button" variant="outline" onClick={saveDraft} disabled={saving} className="rounded-xl border-white/15 bg-white/5">
                    Save draft
                  </Button>
                  <Button type="button" onClick={handleFinalize} disabled={saving} className="rounded-xl bg-teal-600">
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    Finalize
                  </Button>
                </div>
              ) : null}
            </div>
            <AttendanceMarkingTable records={records} readonly={readonly} onChange={handleRecordChange} />
          </div>
        ) : null}
      </GlassCard>
    </PageShell>
  );
}
