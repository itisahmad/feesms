'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, FileText, Plus } from 'lucide-react';
import { getFeeTypes, createFeeType, updateFeeType, getFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure, getClasses, getSchool } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading, PageLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

interface FeeType {
  id: number;
  name: string;
  billing_period: string;
  description?: string;
  billing_period_display?: string;
}

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

const feeTypeTriggerClass = cn(
  'w-full rounded-xl border px-4 py-2.5 text-left text-sm transition',
  'border-white/10 bg-white/5 text-slate-200',
  'focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20'
);

const feeTypePopoverClass =
  'absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0d1324]/95 shadow-xl backdrop-blur-xl';

export default function FeeStructurePage() {
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [academicYearOptions, setAcademicYearOptions] = useState<{ value: string; label: string }[]>([]);
  const [startMonth, setStartMonth] = useState(4);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    fee_type: '',
    school_class: '',
    amount: '',
    billing_period: 'monthly',
    due_day: '5',
    late_fine_per_day: '0',
    academic_year: '',
    allow_yearly_payment: true,
    yearly_discount_percent: '0',
  });
  const [editForm, setEditForm] = useState<typeof form | null>(null);
  const [saving, setSaving] = useState(false);
  const [addingFeeType, setAddingFeeType] = useState(false);
  const [updatingFeeType, setUpdatingFeeType] = useState(false);
  const [activeFeeTypePicker, setActiveFeeTypePicker] = useState<'create' | 'edit' | null>(null);
  const [newFeeType, setNewFeeType] = useState({
    name: '',
    billing_period: 'monthly',
    description: '',
  });
  const [editingFeeTypeId, setEditingFeeTypeId] = useState<number | null>(null);
  const [editingFeeType, setEditingFeeType] = useState({
    name: '',
    billing_period: 'monthly',
    description: '',
  });

  const loadFeeTypes = async () => {
    const { data } = await getFeeTypes();
    setFeeTypes(data.results || data);
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

  const handleAddFeeType = async () => {
    const name = newFeeType.name.trim();
    if (!name) {
      alert('Please enter fee type name');
      return;
    }
    setAddingFeeType(true);
    try {
      const { data } = await createFeeType({
        name,
        description: newFeeType.description.trim(),
        billing_period: newFeeType.billing_period,
      });
      await loadFeeTypes();
      setForm((f) => ({ ...f, fee_type: String(data.id) }));
      setNewFeeType({ name: '', billing_period: 'monthly', description: '' });
    } catch {
      alert('Failed to add fee type');
    } finally {
      setAddingFeeType(false);
    }
  };

  const handleFeeTypeChange = (feeTypeId: string) => {
    setForm((f) => ({ ...f, fee_type: feeTypeId }));

    // Set billing period from selected fee type
    const selectedFeeType = feeTypes.find((ft) => ft.id === parseInt(feeTypeId));
    if (selectedFeeType) {
      setForm((f) => ({ ...f, billing_period: selectedFeeType.billing_period }));
    }
  };

  const handleEditFeeTypeChange = (feeTypeId: string) => {
    if (!editForm) return;

    setEditForm((f) => (f ? { ...f, fee_type: feeTypeId } : null));

    // Set billing period from selected fee type
    const selectedFeeType = feeTypes.find((ft) => ft.id === parseInt(feeTypeId));
    if (selectedFeeType) {
      setEditForm((f) => (f ? { ...f, billing_period: selectedFeeType.billing_period } : null));
    }
  };

  const startFeeTypeEdit = (feeType: FeeType) => {
    setEditingFeeTypeId(feeType.id);
    setEditingFeeType({
      name: feeType.name,
      billing_period: feeType.billing_period,
      description: feeType.description || '',
    });
  };

  const resetFeeTypeEditor = () => {
    setEditingFeeTypeId(null);
    setEditingFeeType({
      name: '',
      billing_period: 'monthly',
      description: '',
    });
  };

  const handleUpdateFeeType = async () => {
    if (!editingFeeTypeId) return;

    const name = editingFeeType.name.trim();
    if (!name) {
      alert('Please enter fee type name');
      return;
    }

    setUpdatingFeeType(true);
    try {
      await updateFeeType(editingFeeTypeId, {
        name,
        billing_period: editingFeeType.billing_period,
        description: editingFeeType.description.trim(),
      });
      await loadFeeTypes();

      const updatedFeeType = feeTypes.find((ft) => ft.id === editingFeeTypeId);
      const billingPeriod = updatedFeeType?.billing_period || editingFeeType.billing_period;

      if (form.fee_type === String(editingFeeTypeId)) {
        setForm((f) => ({ ...f, billing_period: billingPeriod }));
      }
      if (editForm?.fee_type === String(editingFeeTypeId)) {
        setEditForm((f) => (f ? { ...f, billing_period: billingPeriod } : null));
      }

      resetFeeTypeEditor();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(msg || 'Failed to update fee type');
    } finally {
      setUpdatingFeeType(false);
    }
  };

  const renderFeeTypePicker = (
    selectedValue: string,
    onSelect: (value: string) => void,
    pickerMode: 'create' | 'edit'
  ) => {
    const selectedFeeType = feeTypes.find((ft) => ft.id === parseInt(selectedValue, 10));
    const isOpen = activeFeeTypePicker === pickerMode;

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setActiveFeeTypePicker((prev) => (prev === pickerMode ? null : pickerMode))}
          className={feeTypeTriggerClass}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={selectedFeeType ? 'text-slate-200' : 'text-slate-500'}>
              {selectedFeeType ? selectedFeeType.name : 'Select'}
            </span>
            <span className="text-slate-500">{isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
          </div>
        </button>

        {isOpen && (
          <div className={feeTypePopoverClass}>
            <div className="max-h-72 space-y-1 overflow-y-auto p-2">
              {feeTypes.map((ft) => (
                <div
                  key={ft.id}
                  className={cn(
                    'rounded-lg border px-3 py-2',
                    selectedValue === String(ft.id)
                      ? 'border-teal-500/30 bg-teal-500/10'
                      : 'border-transparent bg-white/[0.02]'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(String(ft.id));
                        setActiveFeeTypePicker(null);
                      }}
                      className="flex-1 text-left"
                    >
                      <div className="text-sm font-medium text-slate-200">{ft.name}</div>
                      <div className="text-xs text-slate-500">
                        {ft.billing_period_display || BILLING_PERIODS.find((p) => p.value === ft.billing_period)?.label || ft.billing_period}
                      </div>
                    </button>
                    <button type="button" onClick={() => startFeeTypeEdit(ft)} className={dash.link}>
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-white/10 bg-white/[0.03] p-3">
              {editingFeeTypeId ? (
                <>
                  <p className="text-xs font-medium text-slate-400">Edit fee type</p>
                  <input
                    type="text"
                    value={editingFeeType.name}
                    onChange={(e) => setEditingFeeType((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Fee type name"
                    className={dash.field}
                  />
                  <select
                    value={editingFeeType.billing_period}
                    onChange={(e) => setEditingFeeType((f) => ({ ...f, billing_period: e.target.value }))}
                    className={dash.field}
                  >
                    {BILLING_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleUpdateFeeType}
                      disabled={updatingFeeType}
                      className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-3 py-1.5 text-sm font-medium text-white shadow-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updatingFeeType ? 'Saving...' : 'Save'}
                    </button>
                    <button type="button" onClick={resetFeeTypeEditor} className="text-sm text-slate-400 transition hover:text-slate-200">
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-400">Add extra fee type</p>
                  <input
                    type="text"
                    value={newFeeType.name}
                    onChange={(e) => setNewFeeType((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Smart Class, Activity"
                    className={dash.field}
                  />
                  <select
                    value={newFeeType.billing_period}
                    onChange={(e) => setNewFeeType((f) => ({ ...f, billing_period: e.target.value }))}
                    className={dash.field}
                  >
                    {BILLING_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddFeeType}
                    disabled={addingFeeType}
                    className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 px-3 py-1.5 text-sm font-medium text-white shadow-teal-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {addingFeeType ? 'Adding...' : '+ Add fee type'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fee_type) {
      alert('Please select a fee type');
      return;
    }
    if (!form.school_class) {
      alert('Please select a class');
      return;
    }
    setSaving(true);
    try {
      await createFeeStructure({
        fee_type: parseInt(form.fee_type),
        school_class: parseInt(form.school_class),
        amount: parseFloat(form.amount),
        due_day: parseInt(form.due_day),
        late_fine_per_day: parseFloat(form.late_fine_per_day) || 0,
        academic_year: form.academic_year,
        allow_yearly_payment: form.allow_yearly_payment,
        yearly_discount_percent: parseFloat(form.yearly_discount_percent) || 0,
      });
      setForm({ ...form, amount: '', late_fine_per_day: '0' });
      const { data } = await getFeeStructures();
      setStructures(data.results || data);
    } catch {
      alert('Failed to add fee structure');
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
        subtitle="Set fee amounts per class. Choose billing period: monthly, quarterly, half-yearly, or yearly. Add classes first in the Classes section."
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
            <h2 className={dash.sectionTitle}>Add fee for class</h2>
          </div>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className={dash.label}>Fee type</label>
              {renderFeeTypePicker(form.fee_type, handleFeeTypeChange, 'create')}
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Class</label>
              <select
                value={form.school_class}
                onChange={(e) => setForm((f) => ({ ...f, school_class: e.target.value }))}
                className={dash.field}
                required
              >
                <option value="">Select</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
              <select value={form.academic_year} onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))} className={dash.field}>
                {(academicYearOptions.length ? academicYearOptions : getAcademicYearOptions(4)).map((ay) => (
                  <option key={ay.value} value={ay.value}>
                    {ay.label}
                  </option>
                ))}
              </select>
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
            <div className="space-y-1">
              <label className={dash.label}>Fee type</label>
              {renderFeeTypePicker(editForm.fee_type, handleEditFeeTypeChange, 'edit')}
            </div>
            <div className="space-y-1">
              <label className={dash.label}>Class</label>
              <select
                value={editForm.school_class}
                onChange={(e) => setEditForm((f) => (f ? { ...f, school_class: e.target.value } : null))}
                className={dash.field}
                required
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
              <select
                value={editForm.academic_year}
                onChange={(e) => setEditForm((f) => (f ? { ...f, academic_year: e.target.value } : null))}
                className={dash.field}
              >
                {(academicYearOptions.length ? academicYearOptions : getAcademicYearOptions(4)).map((ay) => (
                  <option key={ay.value} value={ay.value}>
                    {ay.label}
                  </option>
                ))}
              </select>
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
          <div className="overflow-x-auto">
            <table className={dash.table}>
              <thead className={dash.thead}>
                <tr>
                  <th className={dash.th}>Fee type</th>
                  <th className={dash.th}>Class</th>
                  <th className={dash.th}>Amount</th>
                  <th className={dash.th}>Period</th>
                  <th className={dash.th}>Due day</th>
                  <th className={dash.th}>Late fine/day</th>
                  <th className={dash.th}>Academic year</th>
                  <th className={dash.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {structures.map((s, i) => (
                  <motion.tr key={s.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + i * 0.04 }} className={dash.tr}>
                    <td className={dash.td}>{s.fee_type_name}</td>
                    <td className={dash.td}>{s.class_name}</td>
                    <td className={dash.td}>₹{parseFloat(s.amount).toLocaleString('en-IN')}</td>
                    <td className={dash.td}>{s.billing_period_display || BILLING_PERIODS.find((p) => p.value === s.fee_type_billing_period)?.label || s.fee_type_billing_period}</td>
                    <td className={dash.td}>{s.due_day}</td>
                    <td className={dash.td}>₹{parseFloat(s.late_fine_per_day || '0').toLocaleString('en-IN')}</td>
                    <td className={dash.td}>{formatAcademicYear(s.academic_year, startMonth)}</td>
                    <td className={dash.td}>
                      {s.is_locked ? (
                        <span className="text-xs text-amber-400">Linked to students – cannot edit</span>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => openEdit(s)} className={dash.link}>
                            Edit
                          </button>
                          <button type="button" onClick={() => handleDelete(s.id)} className={dash.linkDanger}>
                            Delete
                          </button>
                        </div>
                      )}
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
