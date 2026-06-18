'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Download, ChevronDown, ChevronRight } from 'lucide-react';
import {
  exportAttendanceReport,
  getAttendanceClassReport,
  getAttendanceMyClasses,
  getAttendanceStudentReport,
  type AttendanceClassReport,
  type AttendanceStudentReportResponse,
} from '@/lib/api';
import { ATTENDANCE_STATUS_OPTIONS, AttendanceStatusBadge } from '@/components/attendance/attendance-status-badge';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AttendanceReportsPage() {
  const [classes, setClasses] = useState<{ value: string; label: string; school_class_id: number; section_id: number }[]>([]);
  const [startDate, setStartDate] = useState(monthStart());
  const [endDate, setEndDate] = useState(todayStr());
  const [classKey, setClassKey] = useState('');
  const [status, setStatus] = useState('');
  const [report, setReport] = useState<AttendanceClassReport[]>([]);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [studentReport, setStudentReport] = useState<AttendanceStudentReportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getAttendanceMyClasses()
      .then(({ data }) => {
        const opts = (data.classes || []).map((c) => ({
          value: `${c.school_class_id}-${c.section_id}`,
          label: c.label,
          school_class_id: c.school_class_id,
          section_id: c.section_id,
        }));
        setClasses(opts);
      })
      .catch(() => setClasses([]));
  }, []);

  const selectedClass = useMemo(
    () => classes.find((c) => c.value === classKey),
    [classes, classKey],
  );

  const queryParams = useMemo(() => {
    const params: Record<string, string | number> = {
      start_date: startDate,
      end_date: endDate,
    };
    if (selectedClass) {
      params.school_class = selectedClass.school_class_id;
      params.section = selectedClass.section_id;
    }
    if (status) params.status = status;
    return params;
  }, [startDate, endDate, selectedClass, status]);

  const loadReport = async () => {
    setLoading(true);
    setSelectedStudentId(null);
    setStudentReport(null);
    try {
      const { data } = await getAttendanceClassReport(queryParams);
      setReport(data.classes || []);
    } catch {
      setReport([]);
      alert('Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openStudent = async (studentId: number) => {
    setSelectedStudentId(studentId);
    setStudentReport(null);
    try {
      const { data } = await getAttendanceStudentReport(studentId, {
        start_date: startDate,
        end_date: endDate,
        status: status || undefined,
      });
      setStudentReport(data);
    } catch {
      alert('Could not load student history.');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await exportAttendanceReport(queryParams);
      const url = window.URL.createObjectURL(data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${startDate}-to-${endDate}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Export failed.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        icon={BarChart3}
        eyebrow="Analytics"
        title="Attendance"
        highlight="Reports"
        subtitle="Monthly class summaries, student presence %, and CSV export."
        actions={
          <Link href="/dashboard/attendance" className={cn(dash.link, 'text-sm')}>
            Mark attendance
          </Link>
        }
      />

      <GlassCard delay={0.05}>
        <div className="grid gap-4 border-b border-white/10 p-6 md:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className={dash.label}>From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={dash.field} />
          </div>
          <div>
            <label className={dash.label}>To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={dash.field} />
          </div>
          <div>
            <label className={dash.label}>Class</label>
            <DashboardSelect
              value={classKey}
              onChange={setClassKey}
              allowEmpty
              emptyLabel="All classes"
              placeholder="All classes"
              options={classes.map((c) => ({ value: c.value, label: c.label }))}
            />
          </div>
          <div>
            <label className={dash.label}>Status</label>
            <DashboardSelect
              value={status}
              onChange={setStatus}
              options={ATTENDANCE_STATUS_OPTIONS}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={loadReport} disabled={loading} className="flex-1 rounded-xl bg-teal-600">
              {loading ? 'Loading…' : 'Apply'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleExport}
              disabled={exporting}
              className="rounded-xl border-white/15 bg-white/5"
              title="Export CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {loading ? (
          <InlineLoading />
        ) : report.length === 0 ? (
          <p className={dash.empty}>No attendance records in this period.</p>
        ) : (
          <div className="divide-y divide-white/10">
            {report.map((cls) => {
              const key = `${cls.school_class_id}-${cls.section_id}`;
              const open = expandedClass === key;
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => setExpandedClass(open ? null : key)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left hover:bg-white/[0.02]"
                  >
                    <div className="flex items-center gap-2">
                      {open ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                      <div>
                        <p className="font-medium text-slate-100">{cls.label}</p>
                        <p className="text-xs text-slate-500">
                          {cls.session_days} day{cls.session_days === 1 ? '' : 's'} · {cls.student_count} students
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-teal-300">{cls.average_presence_pct}%</p>
                      <p className="text-[11px] text-slate-500">avg presence</p>
                    </div>
                  </button>
                  {open ? (
                    <div className="overflow-x-auto px-6 pb-4">
                      <table className={dash.table}>
                        <thead className={dash.thead}>
                          <tr>
                            <th className={dash.th}>Roll</th>
                            <th className={dash.th}>Student</th>
                            <th className={dash.th}>Present</th>
                            <th className={dash.th}>Absent</th>
                            <th className={dash.th}>Late</th>
                            <th className={dash.th}>Presence %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cls.students.map((st) => (
                            <tr key={st.student_id} className={dash.tr}>
                              <td className={dash.td}>{st.roll_number || '—'}</td>
                              <td className={dash.td}>
                                <button
                                  type="button"
                                  onClick={() => openStudent(st.student_id)}
                                  className={cn(
                                    dash.link,
                                    selectedStudentId === st.student_id && 'text-teal-200',
                                  )}
                                >
                                  {st.name}
                                </button>
                              </td>
                              <td className={dash.td}>{st.present}</td>
                              <td className={dash.td}>{st.absent}</td>
                              <td className={dash.td}>{st.late}</td>
                              <td className={cn(dash.td, 'font-medium text-teal-300')}>{st.presence_pct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {studentReport ? (
        <GlassCard delay={0.1} className="mt-6">
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className={dash.sectionTitle}>{studentReport.student.name}</h2>
            <p className="text-sm text-slate-500">
              {studentReport.student.class_name}
              {studentReport.student.section_name ? ` · ${studentReport.student.section_name}` : ''}
              {' · '}
              {studentReport.summary.presence_pct}% presence ({studentReport.summary.session_days} days)
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {studentReport.records.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No records in range.</p>
            ) : (
              studentReport.records.map((row) => (
                <div key={row.date} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div>
                    <p className="text-sm text-slate-200">{row.date}</p>
                    {row.remark ? <p className="text-xs text-slate-500">{row.remark}</p> : null}
                  </div>
                  <AttendanceStatusBadge status={row.status} />
                </div>
              ))
            )}
          </div>
        </GlassCard>
      ) : null}
    </PageShell>
  );
}
