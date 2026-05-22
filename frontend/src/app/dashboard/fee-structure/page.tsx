'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search } from 'lucide-react';
import { getFeeTypes, getFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure, getClasses, getSchool } from '@/lib/api';
import { FeeTypeField, type FeeTypeOption } from '@/components/dashboard/fee-type-field';
import { ClassMultiSelect } from '@/components/dashboard/class-multi-select';
import { FeeStructureByClass } from '@/components/dashboard/fee-structure-by-class';
import { formatApiError } from '@/lib/api-errors';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading, PageLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';


interface SchoolClass {
  id: number;
  name: string;
}

interface FeeStructure {
  id: number;
  fee_type: number;
  fee_type_name: string;
  school_class: number | null;
  class_name: string;
  amount: string;
  billing_period_display?: string;
  fee_type_billing_period?: string;
  due_day: number;
  late_fine_per_day: string;
  academic_year: string;
  allow_yearly_payment?: boolean;
  yearly_discount_percent?: number;
  is_locked?: boolean;
  created_at?: string;
}

const MONTH_ABBREV = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getAcademicYearOptions(startMonth: number): { value: string; label: string }[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < 10; i++) {
    const y = startYear + i;
    const next = String(y + 1).slice(-2);
    const value = `${y}-${next}`;
    const endMonth = startMonth === 1 ? 12 : startMonth - 1;
    const endYear = startMonth === 1 ? y : y + 1;
    const label = `${MONTH_ABBREV[startMonth]} ${y} - ${MONTH_ABBREV[endMonth]} ${endYear}`;
    options.push({ value, label });
  }
  return options;
}

function formatAcademicYear(value: string, startMonth: number): string {
  const opts = getAcademicYearOptions(startMonth);
  const found = opts.find((o) => o.value === value);
  return found ? found.label : value;
}

const BILLING_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One-Time Payment' },
] as const;

export default function FeeStructurePage() {
  const [feeTypes, setFeeTypes] = useState<FeeTypeOption[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [tableSearch, setTableSearch] = useState('');
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [academicYearOptions, setAcademicYearOptions] = useState<{ value: string; label: string }[]>([]);
  const [startMonth, setStartMonth] = useState(4);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    fee_type: '',
    school_class_ids: [] as number[],
    amount: '',
    billing_period: 'monthly',
    due_day: '5',
    late_fine_per_day: '0',
    academic_year: '',
    allow_yearly_payment: true,
    yearly_discount_percent: '0',
  });
  const [editForm, setEditForm] = useState<{
    fee_type: string;
    school_class: string;
    amount: string;
    billing_period: string;
    due_day: string;
    late_fine_per_day: string;
    academic_year: string;
    allow_yearly_payment: boolean;
    yearly_discount_percent: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredStructures = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return structures;
    return structures.filter((s) => {
      const period =
        s.billing_period_display ||
        BILLING_PERIODS.find((p) => p.value === s.fee_type_billing_period)?.label ||
        s.fee_type_billing_period ||
        '';
      const haystack = [
        s.fee_type_name,
        s.class_name,
        s.amount,
        period,
        String(s.due_day),
        s.late_fine_per_day,
        s.academic_year,
        formatAcademicYear(s.academic_year, startMonth),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [structures, tableSearch, startMonth]);

  const loadFeeTypes = async () => {
    const { data } = await getFeeTypes();
    setFeeTypes((data.results || data) as FeeTypeOption[]);
  };

  useEffect(() => {
    Promise.all([
      loadFeeTypes(),
      getFeeStructures().then(({ data }) => setStructures(data.results || data)),
      getClasses().then(({ data }) => setClasses(data.results || data)),
      getSchool().then(({ data }) => {
        const list = data.results || data;
        const s = Array.isArray(list) ? list[0] : list;
        const sm = s?.academic_year_start_month ?? 4;
        setStartMonth(sm);
        const opts = getAcademicYearOptions(sm);
        setAcademicYearOptions(opts);
        setForm((f) => ({ ...f, academic_year: f.academic_year || opts[0]?.value || '2026-27' }));
      }),
    ]).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fee_type) {
      alert('Please select a fee type');
      return;
    }
    if (!form.school_class_ids.length) {
      alert('Please select at least one class');
      return;
    }
    setSaving(true);
    try {
      const { data } = await createFeeStructure({
        fee_type: parseInt(form.fee_type),
        school_class_ids: form.school_class_ids,
        amount: parseFloat(form.amount),
        due_day: parseInt(form.due_day),
        late_fine_per_day: parseFloat(form.late_fine_per_day) || 0,
        academic_year: form.academic_year,
        allow_yearly_payment: form.allow_yearly_payment,
        yearly_discount_percent: parseFloat(form.yearly_discount_percent) || 0,
      });
      const bulk = data as { message?: string; created_count?: number };
      if (bulk.message) alert(bulk.message);
      setForm((f) => ({ ...f, amount: '', late_fine_per_day: '0', school_class_ids: [] }));
      const { data: listData } = await getFeeStructures();
      setStructures(listData.results || listData);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: unknown } };
      alert(formatApiError(axErr?.response?.data, 'Failed to add fee structure'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (s: FeeStructure) => {
    setEditingId(s.id);
    setEditForm({
      fee_type: String(s.fee_type),
      school_class: s.school_class ? String(s.school_class) : '',
      amount: s.amount,
      billing_period: s.fee_type_billing_period || 'monthly',
      due_day: String(s.due_day),
      late_fine_per_day: s.late_fine_per_day || '0',
      academic_year: s.academic_year,
      allow_yearly_payment: s.allow_yearly_payment ?? true,
      yearly_discount_percent: String(s.yearly_discount_percent ?? 0),
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm?.fee_type) {
      alert('Please select a fee type');
      return;
    }
    if (!editingId || !editForm?.school_class) return;
    setSaving(true);
    try {
      await updateFeeStructure(editingId, {
        fee_type: parseInt(editForm.fee_type),
        school_class: parseInt(editForm.school_class),
        amount: parseFloat(editForm.amount),
        due_day: parseInt(editForm.due_day),
        late_fine_per_day: parseFloat(editForm.late_fine_per_day) || 0,
        academic_year: editForm.academic_year,
        allow_yearly_payment: editForm.allow_yearly_payment,
        yearly_discount_percent: parseFloat(editForm.yearly_discount_percent) || 0,
      });
      setEditingId(null);
      setEditForm(null);
      const { data } = await getFeeStructures();
      setStructures(data.results || data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Failed to update. Fee may be linked to students.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this fee structure?')) return;
    setSaving(true);
    try {
      await deleteFeeStructure(id);
      const { data } = await getFeeStructures();
      setStructures(data.results || data);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Cannot delete. Fee is linked to students or fee records.');
    } finally {
      setSaving(false);
    }
  };

  const closeEditModal = () => {
    setEditingId(null);
    setEditForm(null);
  };

  if (loading) {
    return (
      <PageShell>
        <PageLoading />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        icon={FileText}
        eyebrow="Fee configuration"
        title="Fee"
        highlight="Structure"
        subtitle="Set fee amounts per class. Select multiple classes at once when the same fee applies (e.g. Admission for Class 1–5)."
        actions={
          <Button
            onClick={() => setShowForm(!showForm)}
            className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400"
          >
            <Plus className="mr-2 h-4 w-4" />
            {showForm ? 'Cancel' : 'Add fee structure'}
          </Button>
        }
      />

      {showForm && (
        <GlassCard delay={0.05}>
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className={dash.sectionTitle}>Add fee for class(es)</h2>
            <p className="mt-1 text-xs text-slate-500">Select one or more classes — same amount and settings apply to each.</p>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 lg:col-span-2">
              <label className={dash.label}>Fee type</label>
              <FeeTypeField
                feeTypes={feeTypes}
                value={form.fee_type}
                onChange={(feeTypeId, billingPeriod) =>
                  setForm((f) => ({ ...f, fee_type: feeTypeId, billing_period: billingPeriod }))
                }
                onFeeTypesChange={loadFeeTypes}
              />
            </div>
            <div className="space-y-1 lg:col-span-2">
              <label className={dash.label}>Classes</label>
              <ClassMultiSelect
                classes={classes}
                selectedIds={form.school_class_ids}
                onChange={(ids) => setForm((f) => ({ ...f, school_class_ids: ids }))}
                disabled={classes.length === 0}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={dash.field}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>
                Billing Period
                <span className={cn(dash.sectionChip, 'ml-1 align-middle')}>From Fee Type</span>
              </label>
              <div className={cn(dash.field, 'bg-white/[0.03]', 'text-slate-400')}>
                {form.fee_type ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200">
                      {(() => {
                        const selectedFeeType = feeTypes.find((ft) => ft.id === parseInt(form.fee_type));
                        const billingPeriod = selectedFeeType?.billing_period;
                        const periodLabel = BILLING_PERIODS.find((p) => p.value === billingPeriod)?.label || billingPeriod;
                        return periodLabel || 'Select fee type';
                      })()}
                    </span>
                    <span className="text-xs text-teal-400">Linked to fee type</span>
                  </div>
                ) : (
                  'Select fee type to see billing period'
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Billing period is automatically set based on the selected fee type and cannot be changed here.
              </p>
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Due day (1-28)</label>
              <input
                type="number"
                min="1"
                max="28"
                value={form.due_day}
                onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}
                className={dash.field}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Late fine/day (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.late_fine_per_day}
                onChange={(e) => setForm((f) => ({ ...f, late_fine_per_day: e.target.value }))}
                className={dash.field}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Academic year</label>
              <DashboardSelect
                value={form.academic_year}
                onChange={(v) => setForm((f) => ({ ...f, academic_year: v }))}
                options={(academicYearOptions.length ? academicYearOptions : getAcademicYearOptions(4)).map((ay) => ({
                  value: ay.value,
                  label: ay.label,
                }))}
              />
            </div>
            <div className="flex items-center gap-2 lg:col-span-1">
              <input
                type="checkbox"
                id="allow_yearly"
                checked={form.allow_yearly_payment}
                onChange={(e) => setForm((f) => ({ ...f, allow_yearly_payment: e.target.checked }))}
                className="rounded border-white/20 bg-white/10 text-teal-500 focus:ring-teal-500/30"
              />
              <label htmlFor="allow_yearly" className="cursor-pointer text-sm font-medium text-slate-400">
                Allow full year payment at once
              </label>
            </div>
            <div className="space-y-1 lg:col-span-1">
              <label className={dash.label}>Discount % for full year payment</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={form.yearly_discount_percent}
                onChange={(e) => setForm((f) => ({ ...f, yearly_discount_percent: e.target.value }))}
                className={dash.field}
              />
              <p className="mt-1 text-xs text-slate-500">e.g. 5 = 5% off when paying whole year upfront</p>
            </div>
            <div className="flex flex-col gap-3 lg:col-span-full lg:flex-row lg:items-end">
              <Button
                type="submit"
                disabled={saving || classes.length === 0}
                className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Add'}
              </Button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              {saving && <InlineLoading message="Saving…" />}
            </div>
          </form>
        </GlassCard>
      )}

      {editingId && editForm && (
        <DashboardModal title="Edit fee structure" wide onClose={closeEditModal}>
          <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <label className={dash.label}>Fee type</label>
              <FeeTypeField
                feeTypes={feeTypes}
                value={editForm.fee_type}
                onChange={(feeTypeId, billingPeriod) =>
                  setEditForm((f) => (f ? { ...f, fee_type: feeTypeId, billing_period: billingPeriod } : null))
                }
                onFeeTypesChange={loadFeeTypes}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Class</label>
              <DashboardSelect
                value={editForm.school_class}
                onChange={(v) => setEditForm((f) => (f ? { ...f, school_class: v } : null))}
                options={classes.map((c) => ({ value: String(c.id), label: c.name }))}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => (f ? { ...f, amount: e.target.value } : null))}
                className={dash.field}
                required
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>
                Billing Period
                <span className={cn(dash.sectionChip, 'ml-1 align-middle')}>From Fee Type</span>
              </label>
              <div className={cn(dash.field, 'bg-white/[0.03]', 'text-slate-400')}>
                {editForm?.fee_type ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-200">
                      {(() => {
                        const selectedFeeType = feeTypes.find((ft) => ft.id === parseInt(editForm.fee_type));
                        const billingPeriod = selectedFeeType?.billing_period;
                        const periodLabel = BILLING_PERIODS.find((p) => p.value === billingPeriod)?.label || billingPeriod;
                        return periodLabel || 'Select fee type';
                      })()}
                    </span>
                    <span className="text-xs text-teal-400">Linked to fee type</span>
                  </div>
                ) : (
                  'Select fee type to see billing period'
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Billing period is automatically set based on the selected fee type and cannot be changed here.
              </p>
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Due day (1-28)</label>
              <input
                type="number"
                min="1"
                max="28"
                value={editForm.due_day}
                onChange={(e) => setEditForm((f) => (f ? { ...f, due_day: e.target.value } : null))}
                className={dash.field}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Late fine/day (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.late_fine_per_day}
                onChange={(e) => setEditForm((f) => (f ? { ...f, late_fine_per_day: e.target.value } : null))}
                className={dash.field}
              />
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Academic year</label>
              <DashboardSelect
                value={editForm.academic_year}
                onChange={(v) => setEditForm((f) => (f ? { ...f, academic_year: v } : null))}
                options={(academicYearOptions.length ? academicYearOptions : getAcademicYearOptions(4)).map((ay) => ({
                  value: ay.value,
                  label: ay.label,
                }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit_allow_yearly"
                checked={editForm.allow_yearly_payment}
                onChange={(e) => setEditForm((f) => (f ? { ...f, allow_yearly_payment: e.target.checked } : null))}
                className="rounded border-white/20 bg-white/10 text-teal-500 focus:ring-teal-500/30"
              />
              <label htmlFor="edit_allow_yearly" className="cursor-pointer text-sm font-medium text-slate-400">
                Allow full year payment
              </label>
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Discount % for full year</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={editForm.yearly_discount_percent}
                onChange={(e) => setEditForm((f) => (f ? { ...f, yearly_discount_percent: e.target.value } : null))}
                className={dash.field}
              />
            </div>
            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row md:items-center">
              <Button type="submit" disabled={saving} className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 disabled:cursor-not-allowed">
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <button type="button" onClick={closeEditModal} className="text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              {saving && <InlineLoading message="Saving…" />}
            </div>
          </form>
        </DashboardModal>
      )}

      <GlassCard delay={0.1}>
        {structures.length === 0 ? (
          <p className={dash.empty}>No fee structure yet. Add classes first, then add fees per class above.</p>
        ) : (
          <>
            <div className="mb-4 max-w-md">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  placeholder="Search fee type, class, amount, period, year..."
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  className={cn(dash.field, 'pl-10')}
                />
              </div>
            </div>
            {filteredStructures.length === 0 ? (
              <p className={dash.empty}>No fee structures match your search.</p>
            ) : (
              <>
                <p className="mb-3 text-xs text-slate-500">
                  Fees are grouped by class. Click a class to expand and see its fee types.
                </p>
                <FeeStructureByClass
                  structures={filteredStructures}
                  classes={classes}
                  searchQuery={tableSearch}
                  formatAcademicYear={(value) => formatAcademicYear(value, startMonth)}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                />
              </>
            )}
          </>
        )}
      </GlassCard>
    </PageShell>
  );
}
