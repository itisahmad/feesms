'use client';

import { useEffect, useState } from 'react';
import { getFeeTypes, createFeeType, updateFeeType, getFeeStructures, createFeeStructure, updateFeeStructure, deleteFeeStructure, getClasses, getSchool } from '@/lib/api';

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
    const selectedFeeType = feeTypes.find(ft => ft.id === parseInt(feeTypeId));
    if (selectedFeeType) {
      setForm((f) => ({ ...f, billing_period: selectedFeeType.billing_period }));
    }
  };

  const handleEditFeeTypeChange = (feeTypeId: string) => {
    if (!editForm) return;
    
    setEditForm((f) => f ? { ...f, fee_type: feeTypeId } : null);
    
    // Set billing period from selected fee type
    const selectedFeeType = feeTypes.find(ft => ft.id === parseInt(feeTypeId));
    if (selectedFeeType) {
      setEditForm((f) => f ? { ...f, billing_period: selectedFeeType.billing_period } : null);
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
          className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500 text-left bg-white"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={selectedFeeType ? 'text-gray-900' : 'text-gray-400'}>
              {selectedFeeType ? selectedFeeType.name : 'Select'}
            </span>
            <span className="text-xs text-gray-400">{isOpen ? '▲' : '▼'}</span>
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 bg-white shadow-lg">
            <div className="max-h-72 overflow-y-auto p-2 space-y-1">
              {feeTypes.map((ft) => (
                <div
                  key={ft.id}
                  className={`rounded-lg border px-3 py-2 ${
                    selectedValue === String(ft.id) ? 'border-teal-200 bg-teal-50' : 'border-transparent bg-white'
                  }`}
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
                      <div className="text-sm font-medium text-gray-800">{ft.name}</div>
                      <div className="text-xs text-gray-500">
                        {ft.billing_period_display || BILLING_PERIODS.find((p) => p.value === ft.billing_period)?.label || ft.billing_period}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => startFeeTypeEdit(ft)}
                      className="text-xs font-medium text-teal-600 hover:text-teal-700"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50 rounded-b-xl">
              {editingFeeTypeId ? (
                <>
                  <p className="text-xs font-medium text-gray-600">Edit fee type</p>
                  <input
                    type="text"
                    value={editingFeeType.name}
                    onChange={(e) => setEditingFeeType((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Fee type name"
                    className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-white"
                  />
                  <select
                    value={editingFeeType.billing_period}
                    onChange={(e) => setEditingFeeType((f) => ({ ...f, billing_period: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-white"
                  >
                    {BILLING_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleUpdateFeeType}
                      disabled={updatingFeeType}
                      className="px-3 py-1.5 rounded bg-teal-600 text-white text-sm disabled:opacity-50"
                    >
                      {updatingFeeType ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={resetFeeTypeEditor}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-600">Add extra fee type</p>
                  <input
                    type="text"
                    value={newFeeType.name}
                    onChange={(e) => setNewFeeType((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Smart Class, Activity"
                    className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-white"
                  />
                  <select
                    value={newFeeType.billing_period}
                    onChange={(e) => setNewFeeType((f) => ({ ...f, billing_period: e.target.value }))}
                    className="w-full px-3 py-2 text-sm rounded border border-gray-200 bg-white"
                  >
                    {BILLING_PERIODS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
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
              {renderFeeTypePicker(form.fee_type, handleFeeTypeChange, 'create')}
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
                Billing Period
                <span className="ml-1 text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded">From Fee Type</span>
              </label>
              <div className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
                {form.fee_type ? (
                  <div className="flex items-center justify-between">
                    <span>
                      {(() => {
                        const selectedFeeType = feeTypes.find(ft => ft.id === parseInt(form.fee_type));
                        const billingPeriod = selectedFeeType?.billing_period;
                        const periodLabel = BILLING_PERIODS.find(p => p.value === billingPeriod)?.label || billingPeriod;
                        return periodLabel || 'Select fee type';
                      })()}
                    </span>
                    <span className="text-xs text-teal-600">Linked to fee type</span>
                  </div>
                ) : (
                  'Select fee type to see billing period'
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Billing period is automatically set based on the selected fee type and cannot be changed here.
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
                {renderFeeTypePicker(editForm.fee_type, handleEditFeeTypeChange, 'edit')}
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
                  Billing Period
                  <span className="ml-1 text-xs text-teal-600 bg-teal-50 px-2 py-1 rounded">From Fee Type</span>
                </label>
                <div className="w-full px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-600">
                  {editForm?.fee_type ? (
                    <div className="flex items-center justify-between">
                      <span>
                        {(() => {
                          const selectedFeeType = feeTypes.find(ft => ft.id === parseInt(editForm.fee_type));
                          const billingPeriod = selectedFeeType?.billing_period;
                          const periodLabel = BILLING_PERIODS.find(p => p.value === billingPeriod)?.label || billingPeriod;
                          return periodLabel || 'Select fee type';
                        })()}
                      </span>
                      <span className="text-xs text-teal-600">Linked to fee type</span>
                    </div>
                  ) : (
                    'Select fee type to see billing period'
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Billing period is automatically set based on the selected fee type and cannot be changed here.
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
                  <td className="py-4 px-6">{s.billing_period_display || BILLING_PERIODS.find((p) => p.value === s.fee_type_billing_period)?.label || s.fee_type_billing_period}</td>
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
