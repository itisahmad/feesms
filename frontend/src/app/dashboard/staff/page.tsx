'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserCog, Plus, KeyRound, Shield } from 'lucide-react';
import {
  createStaffUser,
  deleteStaffUser,
  forgotPassword,
  getStaffUsers,
  updateStaffUser,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { StaffPermissionMatrix } from '@/components/dashboard/staff-permission-matrix';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import {
  emptyModulePermissions,
  normalizeModulePermissions,
  type ModulePermissions,
} from '@/lib/staff-modules';
import { formatApiError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

interface StaffUser {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role: 'owner' | 'accountant' | 'staff';
  is_active: boolean;
  module_permissions?: ModulePermissions;
}

const initialForm = () => ({
  username: '',
  first_name: '',
  last_name: '',
  phone: '',
  password: '',
  password2: '',
});

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [modulePermissions, setModulePermissions] = useState<ModulePermissions>(emptyModulePermissions);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<ModulePermissions>(emptyModulePermissions);

  const loadStaff = async () => {
    const { data } = await getStaffUsers();
    setStaff(data.results || data);
  };

  useEffect(() => {
    loadStaff()
      .catch(() => setStaff([]))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const enabled = Object.values(modulePermissions).some((m) => m?.view);
    if (!enabled) {
      alert('Assign at least one module with View access.');
      return;
    }
    setSaving(true);
    try {
      await createStaffUser({
        ...form,
        module_permissions: normalizeModulePermissions(modulePermissions),
      });
      await loadStaff();
      setForm(initialForm());
      setModulePermissions(emptyModulePermissions());
      alert('Staff login created');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: unknown } };
      alert(formatApiError(axErr?.response?.data, 'Failed to create staff login'));
    } finally {
      setSaving(false);
    }
  };

  const openEditPermissions = (user: StaffUser) => {
    setEditingUser(user);
    setEditPermissions(normalizeModulePermissions(user.module_permissions));
  };

  const handleSavePermissions = async () => {
    if (!editingUser) return;
    const enabled = Object.values(editPermissions).some((m) => m?.view);
    if (!enabled) {
      alert('Staff must have at least one module with View access.');
      return;
    }
    setSaving(true);
    try {
      await updateStaffUser(editingUser.id, {
        module_permissions: normalizeModulePermissions(editPermissions),
      });
      await loadStaff();
      setEditingUser(null);
    } catch {
      alert('Failed to update permissions');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateResetLink = async (user: StaffUser) => {
    setSaving(true);
    try {
      const { data } = await forgotPassword(user.username);
      if (data?.reset_path) {
        const fullLink = `${window.location.origin}${data.reset_path}`;
        await navigator.clipboard.writeText(fullLink);
        alert(`Reset link copied for ${user.username}`);
      } else {
        alert(data?.message || 'Reset instructions generated');
      }
    } catch {
      alert('Failed to generate reset link');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: StaffUser) => {
    setSaving(true);
    try {
      await updateStaffUser(user.id, { is_active: !user.is_active });
      await loadStaff();
    } catch {
      alert('Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: StaffUser) => {
    if (!confirm(`Delete staff login ${user.username}?`)) return;
    setSaving(true);
    try {
      await deleteStaffUser(user.id);
      await loadStaff();
    } catch {
      alert('Failed to delete staff login');
    } finally {
      setSaving(false);
    }
  };

  const summarizeModules = (perms?: ModulePermissions) => {
    const normalized = normalizeModulePermissions(perms);
    const keys = Object.entries(normalized)
      .filter(([, v]) => v?.view)
      .map(([k]) => k.replace(/_/g, ' '));
    return keys.length ? keys.join(', ') : 'No access';
  };

  return (
    <PageShell>
      <PageHeader
        icon={UserCog}
        eyebrow="Access control"
        title="Staff"
        highlight="Logins"
        subtitle="Create staff logins and assign module permissions (view, create, edit, delete, actions). Access is controlled only by the permission matrix below."
      />

      <GlassCard delay={0.05}>
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Add staff login</h2>
          <p className="mt-1 text-sm text-slate-500">
            Staff sign in with <span className="text-slate-300">username + password</span> only (not email). Set permissions below.
          </p>
        </div>
        <form onSubmit={handleCreate} className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder="Username (for sign-in)"
              className={dash.field}
              autoComplete="off"
              required
            />
            <input
              value={form.first_name}
              onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
              placeholder="First name"
              className={dash.field}
            />
            <input
              value={form.last_name}
              onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
              placeholder="Last name"
              className={dash.field}
            />
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="Phone"
              className={dash.field}
            />
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              className={dash.field}
              required
            />
            <input
              type="password"
              value={form.password2}
              onChange={(e) => setForm((f) => ({ ...f, password2: e.target.value }))}
              placeholder="Confirm password"
              className={dash.field}
              required
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-300">Module permissions</h3>
            <StaffPermissionMatrix value={modulePermissions} onChange={setModulePermissions} />
          </div>

          <Button
            type="submit"
            disabled={saving}
            className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 md:w-fit"
          >
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Saving…' : 'Create staff'}
          </Button>
        </form>
      </GlassCard>

      <GlassCard delay={0.1}>
        {loading ? (
          <InlineLoading />
        ) : staff.length === 0 ? (
          <p className={dash.empty}>No staff logins yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className={dash.table}>
              <thead className={dash.thead}>
                <tr>
                  <th className={dash.th}>Username</th>
                  <th className={dash.th}>Name</th>
                  <th className={dash.th}>Modules</th>
                  <th className={dash.th}>Status</th>
                  <th className={dash.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((u, i) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 + i * 0.03 }}
                    className={dash.tr}
                  >
                    <td className={cn(dash.td, 'font-medium text-slate-200')}>{u.username}</td>
                    <td className={dash.td}>
                      {u.first_name} {u.last_name}
                    </td>
                    <td className={cn(dash.td, 'max-w-xs text-xs text-slate-400')}>
                      {summarizeModules(u.module_permissions)}
                    </td>
                    <td className={dash.td}>
                      <span className={cn(dash.badge, u.is_active ? dash.badgeTeal : dash.badgeAmber)}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={dash.td}>
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => openEditPermissions(u)}
                          className={cn(dash.link, 'inline-flex items-center gap-1')}
                        >
                          <Shield className="h-3.5 w-3.5" />
                          Permissions
                        </button>
                        <button type="button" onClick={() => handleToggleActive(u)} className={dash.link}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGenerateResetLink(u)}
                          className={cn(dash.link, 'inline-flex items-center gap-1')}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset link
                        </button>
                        <button type="button" onClick={() => handleDelete(u)} className={dash.linkDanger}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {editingUser && (
        <DashboardModal
          title={`Permissions — ${editingUser.username}`}
          subtitle="Update which modules this staff member can access. Changes apply on their next request."
          onClose={() => setEditingUser(null)}
        >
          <StaffPermissionMatrix value={editPermissions} onChange={setEditPermissions} />
          <div className="mt-6 flex gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={handleSavePermissions}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
            >
              {saving ? 'Saving…' : 'Save permissions'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingUser(null)}
              className="rounded-xl border-white/10 bg-white/5 text-slate-300"
            >
              Cancel
            </Button>
          </div>
        </DashboardModal>
      )}
    </PageShell>
  );
}
