'use client';

import {
  PERMISSION_KEYS,
  PERMISSION_LABELS,
  STAFF_MODULE_DEFINITIONS,
  emptyModulePermissions,
  normalizeModulePermissions,
  type ModulePermissions,
} from '@/lib/staff-modules';
import { cn } from '@/lib/utils';

type Props = {
  value: ModulePermissions;
  onChange: (next: ModulePermissions) => void;
  disabled?: boolean;
};

export function StaffPermissionMatrix({ value, onChange, disabled }: Props) {
  const perms = normalizeModulePermissions(value);

  const setModuleEnabled = (moduleKey: string, enabled: boolean) => {
    const next = { ...perms };
    if (enabled) {
      next[moduleKey] = { view: true, create: false, edit: false, delete: false, actions: false };
    } else {
      next[moduleKey] = { view: false, create: false, edit: false, delete: false, actions: false };
    }
    onChange(next);
  };

  const setPerm = (moduleKey: string, perm: (typeof PERMISSION_KEYS)[number], checked: boolean) => {
    const next = { ...perms };
    const mod = { ...emptyModulePermissions()[moduleKey], ...next[moduleKey] };
    mod[perm] = checked;
    if (perm !== 'view' && checked) {
      mod.view = true;
    }
    if (perm === 'view' && !checked) {
      mod.create = false;
      mod.edit = false;
      mod.delete = false;
      mod.actions = false;
    }
    next[moduleKey] = mod;
    onChange(next);
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wider text-slate-500">
            <th className="px-3 py-2 font-semibold">Module</th>
            <th className="px-2 py-2 text-center font-semibold">Access</th>
            {PERMISSION_KEYS.map((p) => (
              <th key={p} className="px-2 py-2 text-center font-semibold">
                {PERMISSION_LABELS[p]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STAFF_MODULE_DEFINITIONS.map((mod) => {
            const row = perms[mod.key] || {};
            const hasAccess = !!row.view;
            return (
              <tr key={mod.key} className="border-b border-white/5 last:border-0">
                <td className="px-3 py-2 font-medium text-slate-200">{mod.label}</td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={hasAccess}
                    disabled={disabled}
                    onChange={(e) => setModuleEnabled(mod.key, e.target.checked)}
                    className="accent-teal-500"
                    aria-label={`Enable ${mod.label}`}
                  />
                </td>
                {PERMISSION_KEYS.map((p) => (
                  <td key={p} className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!row[p]}
                      disabled={disabled || !hasAccess}
                      onChange={(e) => setPerm(mod.key, p, e.target.checked)}
                      className={cn('accent-teal-500', !hasAccess && 'opacity-40')}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
