export type PermissionKey = 'view' | 'create' | 'edit' | 'delete' | 'actions';

export type ModulePermissions = Record<string, Partial<Record<PermissionKey, boolean>>>;

export interface ModuleDefinition {
  key: string;
  label: string;
  path: string;
}

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  actions: 'Actions',
};

export const STAFF_MODULE_DEFINITIONS: ModuleDefinition[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'classes', label: 'Classes', path: '/dashboard/classes' },
  { key: 'students', label: 'Students', path: '/dashboard/students' },
  { key: 'enquiries', label: 'Enquiries', path: '/dashboard/enquiries' },
  { key: 'fee_structure', label: 'Fee Structure', path: '/dashboard/fee-structure' },
  { key: 'fee_collection', label: 'Fee Collection', path: '/dashboard/fees' },
  { key: 'receipt_templates', label: 'Receipt Templates', path: '/dashboard/receipt-templates' },
  { key: 'results', label: 'Results', path: '/dashboard/results' },
  { key: 'announcements', label: 'Announcements', path: '/dashboard/announcements' },
  { key: 'settings', label: 'Settings', path: '/dashboard/settings' },
];

export const PERMISSION_KEYS: PermissionKey[] = ['view', 'create', 'edit', 'delete', 'actions'];

export function emptyModulePermissions(): ModulePermissions {
  const out: ModulePermissions = {};
  for (const mod of STAFF_MODULE_DEFINITIONS) {
    out[mod.key] = { view: false, create: false, edit: false, delete: false, actions: false };
  }
  return out;
}

export function normalizeModulePermissions(raw?: ModulePermissions | null): ModulePermissions {
  const base = emptyModulePermissions();
  if (!raw) return base;
  for (const mod of STAFF_MODULE_DEFINITIONS) {
    const entry = raw[mod.key];
    if (!entry) continue;
    for (const key of PERMISSION_KEYS) {
      if (typeof entry[key] === 'boolean') {
        base[mod.key]![key] = entry[key];
      }
    }
  }
  return base;
}

export function canAccessModule(
  moduleKey: string,
  permission: PermissionKey,
  opts: {
    isOwner?: boolean;
    modulePermissions?: ModulePermissions;
  }
): boolean {
  if (opts.isOwner || opts.modulePermissions === undefined && opts.isOwner !== false) {
    // caller should pass isOwner explicitly
  }
  if (opts.isOwner) return true;
  const perms = normalizeModulePermissions(opts.modulePermissions);
  return !!perms[moduleKey]?.[permission];
}

export function canViewModule(
  moduleKey: string,
  opts: { isOwner?: boolean; allowedModules?: string[]; modulePermissions?: ModulePermissions }
): boolean {
  if (opts.isOwner) return true;
  if (opts.allowedModules?.includes(moduleKey)) return true;
  return canAccessModule(moduleKey, 'view', opts);
}

/** Map dashboard pathname to module key for route guards. */
export function pathnameToModuleKey(pathname: string): string | null {
  if (pathname === '/dashboard' || pathname === '/dashboard/') return 'dashboard';
  if (pathname.startsWith('/dashboard/fees')) return 'fee_collection';
  if (pathname.startsWith('/dashboard/students')) return 'students';
  if (pathname.startsWith('/dashboard/classes')) return 'classes';
  if (pathname.startsWith('/dashboard/enquiries')) return 'enquiries';
  if (pathname.startsWith('/dashboard/fee-structure')) return 'fee_structure';
  if (pathname.startsWith('/dashboard/receipt-templates')) return 'receipt_templates';
  if (pathname.startsWith('/dashboard/results')) return 'results';
  if (pathname.startsWith('/dashboard/announcements')) return 'announcements';
  if (pathname.startsWith('/dashboard/settings')) return 'settings';
  if (pathname.startsWith('/dashboard/staff')) return 'staff';
  return null;
}

export function firstAllowedPath(allowedModules: string[]): string | null {
  for (const mod of STAFF_MODULE_DEFINITIONS) {
    if (allowedModules.includes(mod.key)) return mod.path;
  }
  return null;
}
