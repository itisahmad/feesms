'use client';

import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  present: 'bg-emerald-500/20 text-emerald-300',
  absent: 'bg-red-500/20 text-red-300',
  late: 'bg-amber-500/20 text-amber-300',
  leave: 'bg-blue-500/20 text-blue-300',
  half_day: 'bg-purple-500/20 text-purple-300',
};

const STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  leave: 'Leave',
  half_day: 'Half day',
};

export function AttendanceStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
        STATUS_STYLES[status] || 'bg-white/10 text-slate-300',
        className,
      )}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export const ATTENDANCE_STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'leave', label: 'Leave' },
  { value: 'half_day', label: 'Half day' },
];
