'use client';

import { useEffect, useState } from 'react';
import { getFeeTypes, createFeeType, getFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure, getClasses, getSchool } from '@/lib/api';

interface FeeType {
  id: number;
  name: string;
  category: string;
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
  billing_period: string;
  billing_period_display?: string;
  due_day: number;
  late_fine_per_day: string;
  academic_year: string;
  allow_yearly_payment?: boolean;
  yearly_discount_percent?: number;
  is_locked?: boolean;
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

const FEE_TYPE_CATEGORIES = [
  { value: 'monthly', label: 'Monthly/Regular' },
  { value: 'one_time', label: 'One-Time/Annual' },
  { value: 'books', label: 'Book & Stationery' },
  { value: 'exam', label: 'Exam & Other' },
] as const;

// Map fee type categories to default billing periods
const getBillingPeriodFromCategory = (category: string): string => {
  switch (category) {
    case 'monthly':
      return 'monthly';
    case 'one_time':
      return 'one_time';
    case 'books':
      return 'monthly'; // Books are typically monthly or one-time, defaulting to monthly
    case 'exam':
      return 'quarterly'; // Exam fees are typically quarterly
    default:
      return 'monthly';
  }
};

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
  const [newFeeType, setNewFeeType] = useState({
    name: '',
    category: 'monthly',
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
        category: newFeeType.category,
        description: newFeeType.description.trim(),
      });
      await loadFeeTypes();
      // Auto-populate billing period based on category
      const billingPeriod = getBillingPeriodFromCategory(newFeeType.category);
      setForm((f) => ({ ...f, fee_type: String(data.id), billing_period: billingPeriod }));
      setNewFeeType({ name: '', category: 'monthly', description: '' });
    } catch {
      alert('Failed to add fee type');
    } finally {
      setAddingFeeType(false);
    }
  };

  const handleFeeTypeChange = (feeTypeId: string) => {
    setForm((f) => ({ ...f, fee_type: feeTypeId }));
    
    // Auto-populate billing period based on selected fee type's category
    const selectedFeeType = feeTypes.find(ft => ft.id === parseInt(feeTypeId));
    if (selectedFeeType) {
      const billingPeriod = getBillingPeriodFromCategory(selectedFeeType.category);
      setForm((f) => ({ ...f, billing_period: billingPeriod }));
    }
  };

  const handleEditFeeTypeChange = (feeTypeId: string) => {
    if (!editForm) return;
    
    setEditForm((f) => f ? { ...f, fee_type: feeTypeId } : null);
    
    // Auto-populate billing period based on selected fee type's category
    const selectedFeeType = feeTypes.find(ft => ft.id === parseInt(feeTypeId));
    if (selectedFeeType) {
      const billingPeriod = getBillingPeriodFromCategory(selectedFeeType.category);
      setEditForm((f) => f ? { ...f, billing_period: billingPeriod } : null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        billing_period: form.billing_period,
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
      billing_period: s.billing_period,
      due_day: String(s.due_day),
      late_fine_per_day: s.late_fine_per_day || '0',
      academic_year: s.academic_year,
      allow_yearly_payment: s.allow_yearly_payment ?? true,
      yearly_discount_percent: String(s.yearly_discount_percent ?? 0),
    });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId || !editForm?.school_class) return;
    setSaving(true);
    try {
      await updateFeeStructure(editingId, {
        fee_type: parseInt(editForm.fee_type),
        school_class: parseInt(editForm.school_class),
        amount: parseFloat(editForm.amount),
        billing_period: editForm.billing_period,
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

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Fee Structure</h1>
      <p className="text-gray-600 mb-6">Set fee amounts per class. Choose billing period: monthly, quarterly, half-yearly, or yearly. Add classes first in the Classes section.</p>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Add fee for class</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fee type</label>
              <select
                value={form.fee_type}
                onChange={(e) => handleFeeTypeChange(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">Select</option>
                {feeTypes.map((ft) => (
                  <option key={ft.id} value={ft.id}>{ft.name}</option>
                ))}
              </select>
              <div className="mt-2 p-2 rounded-lg bg-gray-50 border border-gray-100 space-y-2">
                <p className="text-xs text-gray-500">Add custom fee type for your school</p>
                <input
                  type="text"
                  value={newFeeType.name}
                  onChange={(e) => setNewFeeType((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Smart Class, Activity"
                  className="w-full px-3 py-2 text-sm rounded border border-gray-200"
                />
                <select
                  value={newFeeType.category}
                  onChange={(e) => setNewFeeType((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded border border-gray-200"
                >
                  {FEE_TYPE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAddFeeType}
                  disabled={addingFeeType}
                  className="px-3 py-1.5 rounded bg-teal-600 text-white text-sm disabled:opacity-50"
                >
                  {addingFeeType ? 'Adding...' : '+ Add fee type'}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
              <select
                value={form.school_class}
                onChange={(e) => setForm((f) => ({ ...f, school_class: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
              >
                <option value="">Select</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Billing period 
                <span className="ml-1 text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded">Auto-populated</span>
              </label>
              <select
                value={form.billing_period}
                disabled
                className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed"
              >
                {BILLING_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-0.5">
                Billing period is automatically set based on fee type category.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due day (1-28)</label>
              <input
                type="number"
                min="1"
                max="28"
                value={form.due_day}
                onChange={(e) => setForm((f) => ({ ...f, due_day: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Late fine/day (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.late_fine_per_day}
                onChange={(e) => setForm((f) => ({ ...f, late_fine_per_day: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic year</label>
              <select
                value={form.academic_year}
                onChange={(e) => setForm((f) => ({ ...f, academic_year: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              >
                {(academicYearOptions.length ? academicYearOptions : getAcademicYearOptions(4)).map((ay) => (
                  <option key={ay.value} value={ay.value}>{ay.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allow_yearly"
                checked={form.allow_yearly_payment}
                onChange={(e) => setForm((f) => ({ ...f, allow_yearly_payment: e.target.checked }))}
                className="rounded border-gray-300"
              />
              <label htmlFor="allow_yearly" className="text-sm font-medium text-gray-700">Allow full year payment at once</label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount % for full year payment</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={form.yearly_discount_percent}
                onChange={(e) => setForm((f) => ({ ...f, yearly_discount_percent: e.target.value }))}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-gray-500 mt-0.5">e.g. 5 = 5% off when paying whole year upfront</p>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" disabled={saving || classes.length === 0} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Add'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2.5 text-gray-600 hover:text-gray-800">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {editingId && editForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Edit fee structure</h2>
            <form onSubmit={handleUpdate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fee type</label>
                <select
                  value={editForm.fee_type}
                  onChange={(e) => handleEditFeeTypeChange(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {feeTypes.map((ft) => (
                    <option key={ft.id} value={ft.id}>{ft.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                <select
                  value={editForm.school_class}
                  onChange={(e) => setEditForm((f) => f ? { ...f, school_class: e.target.value } : null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                  required
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.amount}
                  onChange={(e) => setEditForm((f) => f ? { ...f, amount: e.target.value } : null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Billing period 
                  <span className="ml-1 text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded">Auto-populated</span>
                </label>
                <select
                  value={editForm.billing_period}
                  disabled
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600 cursor-not-allowed"
                >
                  {BILLING_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-0.5">
                  Billing period is automatically set based on fee type category.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due day (1-28)</label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={editForm.due_day}
                  onChange={(e) => setEditForm((f) => f ? { ...f, due_day: e.target.value } : null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Late fine/day (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editForm.late_fine_per_day}
                  onChange={(e) => setEditForm((f) => f ? { ...f, late_fine_per_day: e.target.value } : null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic year</label>
                <select
                  value={editForm.academic_year}
                  onChange={(e) => setEditForm((f) => f ? { ...f, academic_year: e.target.value } : null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                >
                  {(academicYearOptions.length ? academicYearOptions : getAcademicYearOptions(4)).map((ay) => (
                    <option key={ay.value} value={ay.value}>{ay.label}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit_allow_yearly"
                  checked={editForm.allow_yearly_payment}
                  onChange={(e) => setEditForm((f) => f ? { ...f, allow_yearly_payment: e.target.checked } : null)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="edit_allow_yearly" className="text-sm font-medium text-gray-700">Allow full year payment</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Discount % for full year</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={editForm.yearly_discount_percent}
                  onChange={(e) => setEditForm((f) => f ? { ...f, yearly_discount_percent: e.target.value } : null)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" onClick={() => { setEditingId(null); setEditForm(null); }} className="px-4 py-2.5 text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-6 px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition"
        >
          + Add Fee Structure
        </button>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading...</div>
        ) : structures.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No fee structure yet. Add classes first, then add fees per class above.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Fee type</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Class</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Amount</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Period</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Due day</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Late fine/day</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Academic year</th>
                <th className="text-left py-4 px-6 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => (
                <tr key={s.id} className="border-b border-gray-50">
                  <td className="py-4 px-6">{s.fee_type_name}</td>
                  <td className="py-4 px-6">{s.class_name}</td>
                  <td className="py-4 px-6">₹{parseFloat(s.amount).toLocaleString('en-IN')}</td>
                  <td className="py-4 px-6">{s.billing_period_display || BILLING_PERIODS.find((p) => p.value === s.billing_period)?.label || s.billing_period}</td>
                  <td className="py-4 px-6">{s.due_day}</td>
                  <td className="py-4 px-6">₹{parseFloat(s.late_fine_per_day || '0').toLocaleString('en-IN')}</td>
                  <td className="py-4 px-6">{formatAcademicYear(s.academic_year, startMonth)}</td>
                  <td className="py-4 px-6">
                    {s.is_locked ? (
                      <span className="text-xs text-amber-600">Linked to students – cannot edit</span>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(s)} className="text-teal-600 hover:text-teal-700 text-sm font-medium">Edit</button>
                        <button onClick={() => handleDelete(s.id)} className="text-red-600 hover:text-red-700 text-sm font-medium">Delete</button>
                      </div>
                    )}
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
