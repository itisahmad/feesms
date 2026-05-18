'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ClipboardList,
  Plus,
  Search,
  Phone,
  Pencil,
  Trash2,
  CalendarClock,
} from 'lucide-react';
import {
  getEnquiries,
  getEnquiryStats,
  createEnquiry,
  updateEnquiry,
  deleteEnquiry,
  getClasses,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { usePermissions } from '@/hooks/use-permissions';
import { formatApiError } from '@/lib/api-errors';
import { cn } from '@/lib/utils';

interface SchoolClass {
  id: number;
  name: string;
}

interface Enquiry {
  id: number;
  name: string;
  phone: string;
  parent_name: string;
  email: string;
  school_class: number | null;
  class_name: string | null;
  enquiry_date: string;
  follow_up_date: string | null;
  status: string;
  status_display: string;
  source: string;
  source_display: string;
  notes: string;
  created_at: string;
}

interface EnquiryStats {
  total: number;
  follow_up_today: number;
  by_status: Record<string, number>;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visited', label: 'Visited' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'lost', label: 'Not interested' },
];

const SOURCE_OPTIONS = [
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'phone', label: 'Phone call' },
  { value: 'referral', label: 'Referral' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

const statusBadgeClass: Record<string, string> = {
  new: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  contacted: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  visited: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  admitted: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  lost: 'bg-slate-500/20 text-slate-400 ring-white/10',
};

const getToday = () => new Date().toISOString().slice(0, 10);

function normalizePhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  return digits;
}

function validatePhoneClient(phone: string): string | null {
  const digits = normalizePhoneInput(phone);
  if (digits.length !== 10) return 'Enter a valid 10-digit phone number.';
  if (!/^[6-9]/.test(digits)) return 'Phone number must start with 6, 7, 8, or 9.';
  return null;
}

const getInitialForm = () => ({
  name: '',
  phone: '',
  parent_name: '',
  email: '',
  school_class: '',
  enquiry_date: getToday(),
  follow_up_date: '',
  status: 'new',
  source: 'walk_in',
  notes: '',
});

const formatDate = (value: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export default function EnquiriesPage() {
  const { canCreate, canEdit, canDelete } = usePermissions();
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [stats, setStats] = useState<EnquiryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [dueTodayOnly, setDueTodayOnly] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(getInitialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadEnquiries = () => {
    setLoading(true);
    getEnquiries({
      search: search || undefined,
      status: statusFilter || undefined,
      class: classFilter ? parseInt(classFilter, 10) : undefined,
      follow_up_due: dueTodayOnly ? 'today' : undefined,
    })
      .then(({ data }) => setEnquiries(data.results || data))
      .catch(() => setEnquiries([]))
      .finally(() => setLoading(false));
  };

  const loadStats = () => {
    getEnquiryStats()
      .then(({ data }) => setStats(data))
      .catch(() => setStats(null));
  };

  useEffect(() => {
    getClasses()
      .then(({ data }) => setClasses(data.results || data))
      .catch(() => setClasses([]));
    loadStats();
  }, []);

  useEffect(() => {
    loadEnquiries();
  }, [search, statusFilter, classFilter, dueTodayOnly]);

  const openCreate = () => {
    setEditingId(null);
    setForm(getInitialForm());
    setError('');
    setShowForm(true);
  };

  const openEdit = (e: Enquiry) => {
    setEditingId(e.id);
    setForm({
      name: e.name,
      phone: e.phone,
      parent_name: e.parent_name || '',
      email: e.email || '',
      school_class: e.school_class ? String(e.school_class) : '',
      enquiry_date: e.enquiry_date,
      follow_up_date: e.follow_up_date || '',
      status: e.status,
      source: e.source,
      notes: e.notes || '',
    });
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    const phoneErr = validatePhoneClient(form.phone);
    if (phoneErr) {
      setError(phoneErr);
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      name: form.name.trim(),
      phone: normalizePhoneInput(form.phone),
      parent_name: form.parent_name.trim(),
      email: form.email.trim(),
      school_class: form.school_class ? parseInt(form.school_class, 10) : null,
      enquiry_date: form.enquiry_date,
      follow_up_date: form.follow_up_date || null,
      status: form.status,
      source: form.source,
      notes: form.notes.trim(),
    };
    try {
      if (editingId) {
        await updateEnquiry(editingId, payload);
      } else {
        await createEnquiry(payload);
      }
      closeForm();
      loadEnquiries();
      loadStats();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: unknown } };
      setError(formatApiError(axErr?.response?.data, 'Failed to save enquiry'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: Enquiry) => {
    if (!confirm(`Remove enquiry for "${e.name}"?`)) return;
    try {
      await deleteEnquiry(e.id);
      loadEnquiries();
      loadStats();
    } catch {
      alert('Could not delete enquiry');
    }
  };

  const isFollowUpOverdue = (e: Enquiry) => {
    if (!e.follow_up_date || e.status === 'admitted' || e.status === 'lost') return false;
    return e.follow_up_date < getToday();
  };

  const isFollowUpToday = (e: Enquiry) => {
    if (!e.follow_up_date || e.status === 'admitted' || e.status === 'lost') return false;
    return e.follow_up_date === getToday();
  };

  return (
    <PageShell>
      <PageHeader
        title="Admission Enquiries"
        subtitle="Register walk-ins and calls so you can follow up later about admission."
        icon={ClipboardList}
        actions={
          canCreate('enquiries') ? (
            <Button
              onClick={openCreate}
              className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400"
            >
              <Plus className="mr-2 h-4 w-4" />
              New enquiry
            </Button>
          ) : undefined
        }
      />

      {stats && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <GlassCard className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total enquiries</p>
            <p className="mt-1 text-2xl font-bold text-white">{stats.total}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Follow-up today</p>
            <p className="mt-1 text-2xl font-bold text-amber-300">{stats.follow_up_today}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">New</p>
            <p className="mt-1 text-2xl font-bold text-sky-300">{stats.by_status?.new ?? 0}</p>
          </GlassCard>
          <GlassCard className="p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Admitted</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">{stats.by_status?.admitted ?? 0}</p>
          </GlassCard>
        </div>
      )}

      <GlassCard className="mb-6 p-4">
        <motion.div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              placeholder="Search name, phone, notes..."
              value={search}
              onChange={(ev) => setSearch(ev.target.value)}
              className={cn(dash.field, 'pl-10')}
            />
          </div>
          <DashboardSelect
            value={statusFilter}
            onChange={setStatusFilter}
            allowEmpty
            emptyLabel="All statuses"
            placeholder="All statuses"
            className="min-w-[160px]"
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <DashboardSelect
            value={classFilter}
            onChange={setClassFilter}
            allowEmpty
            emptyLabel="All classes"
            placeholder="All classes"
            className="min-w-[160px]"
            options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={dueTodayOnly}
              onChange={(ev) => setDueTodayOnly(ev.target.checked)}
              className="rounded border-white/20 bg-white/10 accent-teal-500"
            />
            Follow-up due today
          </label>
        </motion.div>
      </GlassCard>

      {loading ? (
        <InlineLoading message="Loading enquiries..." />
      ) : enquiries.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <p className="text-slate-400">No enquiries yet. Add someone who visited or called about admission.</p>
          {canCreate('enquiries') && (
            <Button onClick={openCreate} className="mt-4 rounded-xl border-0 bg-teal-500/20 text-teal-200 hover:bg-teal-500/30">
              <Plus className="mr-2 h-4 w-4" />
              Register first enquiry
            </Button>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-3">
          {enquiries.map((e, i) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <GlassCard
                className={cn(
                  'p-4',
                  isFollowUpOverdue(e) && 'ring-1 ring-rose-500/40',
                  isFollowUpToday(e) && !isFollowUpOverdue(e) && 'ring-1 ring-amber-500/35'
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <motion.div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{e.name}</h3>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                          statusBadgeClass[e.status] || statusBadgeClass.new
                        )}
                      >
                        {e.status_display}
                      </span>
                    </div>
                    {e.parent_name && (
                      <p className="mt-0.5 text-sm text-slate-400">Parent: {e.parent_name}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
                      <a href={`tel:${e.phone}`} className="inline-flex items-center gap-1 text-teal-300 hover:text-teal-200">
                        <Phone className="h-3.5 w-3.5" />
                        {e.phone}
                      </a>
                      {e.class_name && <span>Class: {e.class_name}</span>}
                      <span>Enquired: {formatDate(e.enquiry_date)}</span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" />
                        Follow-up:{' '}
                        <span
                          className={cn(
                            isFollowUpOverdue(e) && 'font-medium text-rose-400',
                            isFollowUpToday(e) && 'font-medium text-amber-300'
                          )}
                        >
                          {formatDate(e.follow_up_date)}
                        </span>
                      </span>
                      <span>{e.source_display}</span>
                    </div>
                    {e.notes && (
                      <p className="mt-2 line-clamp-2 text-sm text-slate-500">{e.notes}</p>
                    )}
                  </motion.div>
                  <motion.div className="flex shrink-0 gap-2">
                    {canEdit('enquiries') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(e)}
                        className="rounded-lg border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {canDelete('enquiries') && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(e)}
                        className="rounded-lg border-white/10 bg-white/5 text-rose-300 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </motion.div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      {showForm && (
        <DashboardModal
          title={editingId ? 'Edit enquiry' : 'New admission enquiry'}
          subtitle="Save contact details and schedule a follow-up call."
          onClose={closeForm}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={dash.label}>Student / child name *</label>
                <input
                  value={form.name}
                  onChange={(ev) => setForm((f) => ({ ...f, name: ev.target.value }))}
                  className={dash.field}
                  required
                />
              </div>
              <div>
                <label className={dash.label}>Phone *</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={14}
                  value={form.phone}
                  onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))}
                  className={dash.field}
                  placeholder="10-digit mobile (e.g. 9876543210)"
                  required
                />
              </div>
              <div>
                <label className={dash.label}>Parent / guardian name</label>
                <input
                  value={form.parent_name}
                  onChange={(ev) => setForm((f) => ({ ...f, parent_name: ev.target.value }))}
                  className={dash.field}
                />
              </div>
              <motion.div>
                <label className={dash.label}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                  className={dash.field}
                />
              </motion.div>
              <div>
                <label className={dash.label}>Class interested in</label>
                <DashboardSelect
                  value={form.school_class}
                  onChange={(v) => setForm((f) => ({ ...f, school_class: v }))}
                  allowEmpty
                  emptyLabel="Not specified"
                  placeholder="Not specified"
                  options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
                />
              </div>
              <motion.div>
                <label className={dash.label}>How they heard about us</label>
                <DashboardSelect
                  value={form.source}
                  onChange={(v) => setForm((f) => ({ ...f, source: v }))}
                  options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </motion.div>
              <div>
                <label className={dash.label}>Enquiry date</label>
                <input
                  type="date"
                  value={form.enquiry_date}
                  onChange={(ev) => setForm((f) => ({ ...f, enquiry_date: ev.target.value }))}
                  className={dash.field}
                  required
                />
              </div>
              <div>
                <label className={dash.label}>Follow-up date</label>
                <input
                  type="date"
                  value={form.follow_up_date}
                  onChange={(ev) => setForm((f) => ({ ...f, follow_up_date: ev.target.value }))}
                  className={dash.field}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={dash.label}>Status</label>
                <DashboardSelect
                  value={form.status}
                  onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                  options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={dash.label}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(ev) => setForm((f) => ({ ...f, notes: ev.target.value }))}
                  className={cn(dash.field, 'min-h-[88px] resize-y')}
                  placeholder="What they asked, fees discussed, next steps..."
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                type="submit"
                disabled={saving}
                className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingId ? 'Update enquiry' : 'Save enquiry'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closeForm}
                className="rounded-xl border-white/10 bg-white/5 text-slate-300"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DashboardModal>
      )}
    </PageShell>
  );
}
