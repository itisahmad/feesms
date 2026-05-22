'use client';

import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

export type ClassOption = { id: number; name: string };

type ClassMultiSelectProps = {
  classes: ClassOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
};

export function ClassMultiSelect({ classes, selectedIds, onChange, disabled }: ClassMultiSelectProps) {
  const toggle = (classId: number) => {
    if (disabled) return;
    onChange(
      selectedIds.includes(classId)
        ? selectedIds.filter((id) => id !== classId)
        : [...selectedIds, classId]
    );
  };

  const selectAll = () => onChange(classes.map((c) => c.id));
  const clearAll = () => onChange([]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={selectAll}
          disabled={disabled || classes.length === 0}
          className={dash.link}
        >
          Select all
        </button>
        <span className="text-slate-600">·</span>
        <button type="button" onClick={clearAll} disabled={disabled} className="text-sm text-slate-500 hover:text-slate-300">
          Clear
        </button>
        <span className="ml-auto text-xs text-teal-300/90">
          {selectedIds.length} of {classes.length} selected
        </span>
      </div>
      <div className={cn(dash.innerPanel, 'max-h-40 space-y-1 overflow-y-auto')}>
        {classes.length === 0 ? (
          <span className="text-sm text-slate-500">No classes yet — add classes first.</span>
        ) : (
          classes.map((c) => (
            <label
              key={c.id}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition hover:bg-white/5',
                selectedIds.includes(c.id) && 'bg-teal-500/10'
              )}
            >
              <span className="text-slate-300">{c.name}</span>
              <input
                type="checkbox"
                checked={selectedIds.includes(c.id)}
                onChange={() => toggle(c.id)}
                disabled={disabled}
                className="rounded accent-teal-500"
              />
            </label>
          ))
        )}
      </div>
    </div>
  );
}
