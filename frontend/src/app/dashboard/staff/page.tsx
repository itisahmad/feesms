'use client';

import { useEffect, useState } from 'react';
import { createStaffUser, deleteStaffUser, forgotPassword, getStaffUsers, updateStaffUser } from '@/lib/api';

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
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Staff Login</h1>
      <p className="text-gray-600 mb-8">Create and manage staff logins for your school. Staff can sign in with role-based access.</p>

      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Add staff login</h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="Username" className="px-4 py-2 rounded-lg border border-gray-200" required />
          <input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} placeholder="First name" className="px-4 py-2 rounded-lg border border-gray-200" />
          <input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} placeholder="Last name" className="px-4 py-2 rounded-lg border border-gray-200" />
          <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email" className="px-4 py-2 rounded-lg border border-gray-200" />
          <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone" className="px-4 py-2 rounded-lg border border-gray-200" />
          <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as 'accountant' | 'staff' }))} className="px-4 py-2 rounded-lg border border-gray-200">
            <option value="staff">Staff</option>
            <option value="accountant">Accountant</option>
          </select>
          <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="Password" className="px-4 py-2 rounded-lg border border-gray-200" required />
          <input type="password" value={form.password2} onChange={(e) => setForm((f) => ({ ...f, password2: e.target.value }))} placeholder="Confirm password" className="px-4 py-2 rounded-lg border border-gray-200" required />
          <button type="submit" disabled={saving} className="px-6 py-2 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Staff'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : staff.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No staff logins yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4">Username</th>
                <th className="text-left py-3 px-4">Name</th>
                <th className="text-left py-3 px-4">Role</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id} className="border-b border-gray-50">
                  <td className="py-3 px-4">{u.username}</td>
                  <td className="py-3 px-4">{u.first_name} {u.last_name}</td>
                  <td className="py-3 px-4">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u, e.target.value as 'accountant' | 'staff')}
                      className="px-2 py-1 rounded border border-gray-200"
                    >
                      <option value="staff">Staff</option>
                      <option value="accountant">Accountant</option>
                    </select>
                  </td>
                  <td className="py-3 px-4">{u.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="py-3 px-4 flex gap-3">
                    <button onClick={() => handleToggleActive(u)} className="text-teal-600 hover:text-teal-700">{u.is_active ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => handleGenerateResetLink(u)} className="text-indigo-600 hover:text-indigo-700">Reset Link</button>
                    <button onClick={() => handleDelete(u)} className="text-red-600 hover:text-red-700">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
