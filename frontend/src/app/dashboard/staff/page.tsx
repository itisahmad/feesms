'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { UserCog, Plus, KeyRound } from 'lucide-react';
import { createStaffUser, deleteStaffUser, forgotPassword, getStaffUsers, updateStaffUser } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
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
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    username: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role: 'staff' as 'accountant' | 'staff',
    password: '',
    password2: '',
  });

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
    setSaving(true);
    try {
      await createStaffUser(form);
      await loadStaff();
      setForm({
        username: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role: 'staff',
        password: '',
        password2: '',
      });
      alert('Staff login created');
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string; role?: string[]; username?: string[]; password?: string[] } } };
      const msg = axErr?.response?.data?.detail
        || axErr?.response?.data?.role?.[0]
        || axErr?.response?.data?.username?.[0]
        || axErr?.response?.data?.password?.[0]
        || 'Failed to create staff login';
      alert(msg);
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

  const handleRoleChange = async (user: StaffUser, role: 'accountant' | 'staff') => {
    setSaving(true);
    try {
      await updateStaffUser(user.id, { role });
      await loadStaff();
    } catch {
      alert('Failed to update role');
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

  return (
    <PageShell>
      <PageHeader
        icon={UserCog}
        eyebrow="Access control"
        title="Staff"
        highlight="Logins"
        subtitle="Create and manage staff logins for your school. Staff can sign in with role-based access."
      />

      <GlassCard delay={0.05}>
        <motion.div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Add staff login</h2>
        </motion.div>
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
          <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="Username" className={dash.field} required />
          <input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="First name" className={dash.field} />
          <input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="Last name" className={dash.field} />
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className={dash.field} />
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className={dash.field} />
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'accountant' | 'staff' }))} className={dash.field}>
            <option value="staff">Staff</option>
            <option value="accountant">Accountant</option>
          </select>
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" className={dash.field} required />
          <input type="password" value={form.password2} onChange={(e) => setForm((f) => ({ ...f, password2: e.target.value }))} placeholder="Confirm password" className={dash.field} required />
          <Button type="submit" disabled={saving} className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0 md:col-span-3 md:w-fit">
            <Plus className="mr-2 h-4 w-4" />
            {saving ? 'Saving…' : 'Create Staff'}
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
                    <td className={dash.td}>{u.first_name} {u.last_name}</td>
                    <td className={dash.td}>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u, e.target.value as 'accountant' | 'staff')}
                        className={dash.fieldSm}
                      >
                        <option value="staff">Staff</option>
                        <option value="accountant">Accountant</option>
                      </select>
                    </td>
                    <td className={dash.td}>
                      <span className={cn(dash.badge, u.is_active ? dash.badgeTeal : dash.badgeAmber)}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className={dash.td}>
                      <motion.div className="flex flex-wrap gap-3">
                        <button type="button" onClick={() => handleToggleActive(u)} className={dash.link}>
                          {u.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" onClick={() => handleGenerateResetLink(u)} className={cn(dash.link, 'inline-flex items-center gap-1')}>
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset link
                        </button>
                        <button type="button" onClick={() => handleDelete(u)} className={dash.linkDanger}>
                          Delete
                        </button>
                      </motion.div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </PageShell>
  );
}
