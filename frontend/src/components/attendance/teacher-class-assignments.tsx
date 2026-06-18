'use client';

import { useEffect, useState } from 'react';
import { bulkSetAttendanceAssignments, getAttendanceAssignments, getClasses } from '@/lib/api';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';

interface TeacherClassAssignmentsModalProps {
  staffUserId: number;
  staffLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

export function TeacherClassAssignmentsModal({
  staffUserId,
  staffLabel,
  onClose,
  onSaved,
}: TeacherClassAssignmentsModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [options, setOptions] = useState<{ key: string; label: string; school_class_id: number; section_id: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getClasses(), getAttendanceAssignments(staffUserId)])
      .then(([classesRes, assignmentsRes]) => {
        const classes = classesRes.data.results || classesRes.data;
        const assignments = assignmentsRes.data.results || assignmentsRes.data;
        const opts: { key: string; label: string; school_class_id: number; section_id: number }[] = [];
        for (const c of classes) {
          for (const s of c.sections || []) {
            opts.push({
              key: `${c.id}-${s.id}`,
              label: `${c.name} · Section ${s.name}`,
              school_class_id: c.id,
              section_id: s.id,
            });
          }
        }
        setOptions(opts);
        const preselected = new Set(
          (assignments as { school_class: number; section: number }[]).map(
            (a) => `${a.school_class}-${a.section}`,
          ),
        );
        setSelected(preselected);
      })
      .finally(() => setLoading(false));
  }, [staffUserId]);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const assignments = options
        .filter((o) => selected.has(o.key))
        .map((o) => ({ school_class_id: o.school_class_id, section_id: o.section_id }));
      await bulkSetAttendanceAssignments({ staff_user_id: staffUserId, assignments });
      onSaved();
      onClose();
    } catch {
      alert('Failed to save class assignments.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardModal
      title="Assign classes"
      subtitle={`Classes ${staffLabel} can mark attendance for`}
      onClose={onClose}
      wide
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading classes…</p>
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {options.map((o) => (
            <label
              key={o.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 py-2 hover:bg-white/5"
            >
              <input
                type="checkbox"
                checked={selected.has(o.key)}
                onChange={() => toggle(o.key)}
                className="rounded border-white/20"
              />
              <span className="text-sm text-slate-200">{o.label}</span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-white/15 bg-white/5">
          Cancel
        </Button>
        <Button type="button" disabled={saving} onClick={handleSave} className="rounded-xl bg-teal-600">
          {saving ? 'Saving…' : 'Save assignments'}
        </Button>
      </div>
    </DashboardModal>
  );
}
