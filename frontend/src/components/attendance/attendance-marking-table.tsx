'use client';

import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { AttendanceStatusBadge } from '@/components/attendance/attendance-status-badge';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'late', label: 'Late' },
  { value: 'leave', label: 'Leave' },
  { value: 'half_day', label: 'Half day' },
];

export type AttendanceRecordDraft = {
  student_id: number;
  student_name: string;
  roll_number: string;
  status: string;
  remark: string;
};

interface AttendanceMarkingTableProps {
  records: AttendanceRecordDraft[];
  readonly?: boolean;
  onChange: (studentId: number, patch: Partial<Pick<AttendanceRecordDraft, 'status' | 'remark'>>) => void;
}

export function AttendanceMarkingTable({ records, readonly, onChange }: AttendanceMarkingTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-left text-slate-400">
            <th className="px-4 py-3 font-medium">Roll</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Remark</th>
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr key={row.student_id} className="border-b border-white/5">
              <td className="px-4 py-3 text-slate-400">{row.roll_number || '—'}</td>
              <td className="px-4 py-3 font-medium text-slate-100">{row.student_name}</td>
              <td className="px-4 py-3">
                {readonly ? (
                  <AttendanceStatusBadge status={row.status} />
                ) : (
                  <DashboardSelect
                    value={row.status}
                    onChange={(v) => onChange(row.student_id, { status: v })}
                    options={STATUS_OPTIONS}
                    className="min-h-0 py-1.5 text-xs"
                  />
                )}
              </td>
              <td className="px-4 py-3">
                <input
                  value={row.remark}
                  readOnly={readonly}
                  onChange={(e) => onChange(row.student_id, { remark: e.target.value })}
                  placeholder="Optional"
                  className={cn(dash.fieldSm, 'w-full min-w-[120px]')}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
