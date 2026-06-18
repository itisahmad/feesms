'use client';

import { CalendarCheck } from 'lucide-react';
import { GlassCard } from '@/components/dashboard/page-shell';
import { dash } from '@/lib/dashboard-ui';
import { AttendanceStatusBadge } from '@/components/attendance/attendance-status-badge';
import type { ParentAttendanceSummary } from '@/lib/api';

type StudentAttendanceSectionProps = {
  summary?: ParentAttendanceSummary | null;
};

export function StudentAttendanceSection({ summary }: StudentAttendanceSectionProps) {
  if (!summary || summary.session_days === 0) return null;

  return (
    <GlassCard delay={0.12}>
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-white">Attendance</h2>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {summary.period_start} to {summary.period_end}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[11px] text-slate-500">Presence</p>
          <p className="text-lg font-semibold text-teal-300">{summary.presence_pct}%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[11px] text-slate-500">Present</p>
          <p className="text-lg font-semibold text-emerald-300">{summary.present_days}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[11px] text-slate-500">Absent</p>
          <p className="text-lg font-semibold text-red-300">{summary.absent_days}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
          <p className="text-[11px] text-slate-500">Days marked</p>
          <p className="text-lg font-semibold text-slate-200">{summary.session_days}</p>
        </div>
      </div>
      {summary.recent_absences.length > 0 ? (
        <div className="border-t border-white/10 px-4 py-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Recent absences</p>
          <div className="space-y-2">
            {summary.recent_absences.map((row) => (
              <div key={row.date} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-300">{row.date}</span>
                <AttendanceStatusBadge status={row.status} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </GlassCard>
  );
}
