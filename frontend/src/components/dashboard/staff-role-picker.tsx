'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { StaffRole } from '@/lib/api';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

type StaffRolePickerProps = {
  roles: StaffRole[];
  value: string;
  onChange: (value: string) => void;
  onAddRole: () => void;
  onDeleteRole: (role: StaffRole) => void;
  placeholder?: string;
  disabled?: boolean;
};

const panelClass =
  'absolute left-0 right-0 top-[calc(100%+4px)] z-[100] max-h-64 overflow-y-auto rounded-xl border border-[var(--dash-glass-border)] bg-[#0c1222]/98 py-1 shadow-xl shadow-black/40 backdrop-blur-xl';

export function StaffRolePicker({
  roles,
  value,
  onChange,
  onAddRole,
  onDeleteRole,
  placeholder = 'Select role (optional)',
  disabled,
}: StaffRolePickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = roles.find((r) => String(r.id) === value);
  const displayLabel = selected?.name ?? placeholder;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          dash.field,
          'flex min-h-[42px] items-center justify-between gap-2 text-left',
          !selected && 'text-[var(--dash-text-muted)]',
        )}
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 opacity-50 transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className={panelClass}>
          <button
            type="button"
            onClick={() => pick('')}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-teal-500/15',
              value === '' ? 'bg-teal-500/10 text-teal-200' : 'text-slate-300',
            )}
          >
            <Check className={cn('h-3.5 w-3.5 shrink-0', value === '' ? 'opacity-100' : 'opacity-0')} />
            <span>{placeholder}</span>
          </button>

          {roles.map((role) => {
            const isSelected = value === String(role.id);
            return (
              <div
                key={role.id}
                className={cn(
                  'flex items-center gap-1 px-2 py-0.5',
                  isSelected && 'bg-teal-500/10',
                )}
              >
                <button
                  type="button"
                  title={`Delete ${role.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteRole(role);
                  }}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/15 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => pick(String(role.id))}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm transition hover:bg-teal-500/15',
                    isSelected ? 'text-teal-200' : 'text-slate-200',
                  )}
                >
                  <Check className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{role.name}</span>
                </button>
              </div>
            );
          })}

          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAddRole();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-teal-400 transition hover:bg-teal-500/15"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Add role…
          </button>
        </div>
      ) : null}
    </div>
  );
}
