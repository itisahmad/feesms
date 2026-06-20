'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserCog, Plus, KeyRound, Shield } from 'lucide-react';
import {
  createStaffUser,
  createStaffRole,
  deleteStaffUser,
  deleteStaffRole,
  forgotPassword,
  getStaffRoles,
  getStaffUsers,
  updateStaffUser,
  updateStaffRole,
  type StaffRole,
} from '@/lib/api';
import { TeacherClassAssignmentsModal } from '@/components/attendance/teacher-class-assignments';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { StaffRolePicker } from '@/components/dashboard/staff-role-picker';
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
  staff_role?: number | null;
  staff_role_name?: string | null;
  module_permissions?: ModulePermissions;
}

const initialForm = () => ({
  username: '',
  first_name: '',
  last_name: '',
  phone: '',
  password: '',
  password2: '',
  staff_role: '',
});


export default function StaffPage() {
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [modulePermissions, setModulePermissions] = useState<ModulePermissions>(emptyModulePermissions);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<ModulePermissions>(emptyModulePermissions);
  const [assignUser, setAssignUser] = useState<StaffUser | null>(null);
  const [roleForm, setRoleForm] = useState({ name: '', description: '' });
  const [editingRole, setEditingRole] = useState<StaffRole | null>(null);
  const [editRoleForm, setEditRoleForm] = useState({ name: '', description: '' });
  const [showQuickAddRole, setShowQuickAddRole] = useState(false);
  const [quickRoleForm, setQuickRoleForm] = useState({ name: '', description: '' });

  const loadStaff = async () => {
    const { data } = await getStaffUsers();
    setStaff(data.results || data);
  };

  const loadRoles = async () => {
    const { data } = await getStaffRoles();
    setRoles(Array.isArray(data) ? data : data.results);
  };

  useEffect(() => {
    Promise.all([loadStaff(), loadRoles()])
      .catch(() => {
        setStaff([]);
        setRoles([]);
      })
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
        staff_role: form.staff_role ? parseInt(form.staff_role) : undefined,
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

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleForm.name.trim()) return;
    setSaving(true);
    try {
      await createStaffRole({
        name: roleForm.name.trim(),
        description: roleForm.description,
      });
      await loadRoles();
      setRoleForm({ name: '', description: '' });
      alert('Role created');
    } catch {
      alert('Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRole = async () => {
    if (!editingRole) return;
    if (!editRoleForm.name.trim()) {
      alert('Role name is required.');
      return;
    }
    setSaving(true);
    try {
      await updateStaffRole(editingRole.id, {
        name: editRoleForm.name.trim(),
        description: editRoleForm.description,
      });
      await loadRoles();
      setEditingRole(null);
    } catch {
      alert('Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async (role: StaffRole) => {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    setSaving(true);
    try {
      await deleteStaffRole(role.id);
      await loadRoles();
      if (form.staff_role === String(role.id)) {
        setForm((f) => ({ ...f, staff_role: '' }));
      }
    } catch {
      alert('Cannot delete role — remove it from staff first.');
    } finally {
      setSaving(false);
    }
  };

  const handleStaffRoleChange = (value: string) => {
    setForm((f) => ({ ...f, staff_role: value }));
  };

  const openQuickAddRole = () => {
    setQuickRoleForm({ name: '', description: '' });
    setShowQuickAddRole(true);
  };

  const handleQuickAddRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickRoleForm.name.trim()) {
      alert('Enter a role name.');
      return;
    }
    setSaving(true);
    try {
      const { data: created } = await createStaffRole({
        name: quickRoleForm.name.trim(),
        description: quickRoleForm.description,
      });
      await loadRoles();
      setForm((f) => ({ ...f, staff_role: String(created.id) }));
      setShowQuickAddRole(false);
      setQuickRoleForm({ name: '', description: '' });
    } catch {
      alert('Failed to create role');
    } finally {
      setSaving(false);
    }
  };

  const openEditRole = (role: StaffRole) => {
    setEditingRole(role);
    setEditRoleForm({ name: role.name, description: role.description || '' });
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
        subtitle="Roles label staff (e.g. Teacher). Module permissions are set per staff login."
      />

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition',
            tab === 'users' ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-white/5',
          )}
        >
          Staff users
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={cn(
            'rounded-xl px-4 py-2 text-sm font-medium transition',
            tab === 'roles' ? 'bg-teal-500/20 text-teal-200' : 'text-slate-400 hover:bg-white/5',
          )}
        >
          Roles
        </button>
      </div>

      {tab === 'roles' ? (
        <>
          <GlassCard delay={0.05}>
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className={dash.sectionTitle}>Add role</h2>
              <p className="mt-1 text-sm text-slate-500">
                A label only — e.g. Teacher, Clerk. Does not control access; set permissions on each staff login.
              </p>
            </div>
            <form onSubmit={handleCreateRole} className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <input
                  value={roleForm.name}
                  onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Role name (e.g. Teacher)"
                  className={dash.field}
                  required
                />
                <input
                  value={roleForm.description}
                  onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Short description"
                  className={dash.field}
                />
              </div>
              <Button type="submit" disabled={saving} className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0">
                Create role
              </Button>
            </form>
          </GlassCard>
          <GlassCard delay={0.1} className="mt-6">
            {roles.length === 0 ? (
              <p className={dash.empty}>No roles yet.</p>
            ) : (
              <div className="divide-y divide-white/10">
                {roles.map((role) => (
                  <div key={role.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                    <div>
                      <p className="font-medium text-slate-100">{role.name}</p>
                      <p className="text-xs text-slate-500">{role.description || role.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={dash.link}
                        onClick={() => openEditRole(role)}
                      >
                        Edit
                      </button>
                      <button type="button" className={dash.linkDanger} onClick={() => handleDeleteRole(role)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </>
      ) : (
        <>
      <GlassCard delay={0.05}>
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Add staff login</h2>
          <p className="mt-1 text-sm text-slate-500">
            Staff sign in at <span className="text-slate-300">/login/staff</span> with school code + username.
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
            <StaffRolePicker
              roles={roles}
              value={form.staff_role}
              onChange={handleStaffRoleChange}
              onAddRole={openQuickAddRole}
              onDeleteRole={handleDeleteRole}
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
            <p className="mb-3 text-xs text-slate-500">
              Role above is only a label. Set what this staff member can access here.
            </p>
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
                  <th className={dash.th}>Role</th>
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
                    <td className={dash.td}>{u.staff_role_name || '—'}</td>
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
                          onClick={() => setAssignUser(u)}
                          className={dash.link}
                        >
                          Assign classes
                        </button>
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

      {editingRole && (
        <DashboardModal
          title={`Edit role — ${editingRole.name}`}
          subtitle="Role name is for your records only. Staff access is set per login."
          onClose={() => setEditingRole(null)}
        >
          <div className="space-y-4">
            <input
              value={editRoleForm.name}
              onChange={(e) => setEditRoleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Role name"
              className={dash.field}
              required
            />
            <input
              value={editRoleForm.description}
              onChange={(e) => setEditRoleForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description"
              className={dash.field}
            />
          </div>
          <div className="mt-6 flex gap-2">
            <Button
              type="button"
              disabled={saving}
              onClick={handleSaveRole}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRole(null)}
              className="rounded-xl border-white/10 bg-white/5 text-slate-300"
            >
              Cancel
            </Button>
          </div>
        </DashboardModal>
      )}

      {assignUser && (
        <TeacherClassAssignmentsModal
          staffUserId={assignUser.id}
          staffLabel={assignUser.username}
          onClose={() => setAssignUser(null)}
          onSaved={() => setAssignUser(null)}
        />
      )}

      {showQuickAddRole && (
        <DashboardModal
          title="Add role"
          subtitle="Label for this staff member's job (e.g. Teacher). Does not set permissions."
          onClose={() => setShowQuickAddRole(false)}
        >
          <form onSubmit={handleQuickAddRole} className="space-y-4">
            <input
              value={quickRoleForm.name}
              onChange={(e) => setQuickRoleForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Role name (e.g. Teacher, Clerk)"
              className={dash.field}
              required
              autoFocus
            />
            <input
              value={quickRoleForm.description}
              onChange={(e) => setQuickRoleForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Short description (optional)"
              className={dash.field}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
              >
                {saving ? 'Saving…' : 'Save role'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowQuickAddRole(false)}
                className="rounded-xl border-white/10 bg-white/5 text-slate-300"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DashboardModal>
      )}
        </>
      )}
    </PageShell>
  );
}
