'use client';

import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { createFeeType, updateFeeType } from '@/lib/api';
import { formatApiError } from '@/lib/api-errors';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

export type FeeTypeOption = {
  id: number;
  name: string;
  billing_period: string;
  billing_period_display?: string;
  description?: string;
  is_system?: boolean;
  can_edit?: boolean;
};

const BILLING_PERIODS = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'half_yearly', label: 'Half-Yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one_time', label: 'One-Time Payment' },
] as const;

type FeeTypeFieldProps = {
  feeTypes: FeeTypeOption[];
  value: string;
  onChange: (feeTypeId: string, billingPeriod: string) => void;
  onFeeTypesChange: () => void | Promise<void>;
  disabled?: boolean;
};

const emptyForm = () => ({
  name: '',
  billing_period: 'monthly',
  description: '',
});

export function FeeTypeField({ feeTypes, value, onChange, onFeeTypesChange, disabled }: FeeTypeFieldProps) {
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = feeTypes.find((ft) => ft.id === parseInt(value, 10));
  const canEditSelected = !!selected?.can_edit;

  const openAdd = () => {
    setForm(emptyForm());
    setError(null);
    setModalMode('add');
  };

  const openEdit = () => {
    if (!selected || !canEditSelected) return;
    setForm({
      name: selected.name,
      billing_period: selected.billing_period,
      description: selected.description || '',
    });
    setError(null);
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setError(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('Fee type name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        billing_period: form.billing_period,
        description: form.description.trim(),
      };
      if (modalMode === 'add') {
        const { data } = await createFeeType(payload);
        await onFeeTypesChange();
        onChange(String(data.id), data.billing_period || form.billing_period);
        closeModal();
      } else if (modalMode === 'edit' && selected) {
        const { data } = await updateFeeType(selected.id, payload);
        await onFeeTypesChange();
        onChange(String(data.id), data.billing_period || form.billing_period);
        closeModal();
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: unknown } };
      setError(formatApiError(axErr?.response?.data, 'Failed to save fee type'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <DashboardSelect
            value={value}
            onChange={(v) => {
              const ft = feeTypes.find((f) => f.id === parseInt(v, 10));
              onChange(v, ft?.billing_period || 'monthly');
            }}
            allowEmpty
            emptyLabel="Select fee type"
            placeholder="Select fee type"
            disabled={disabled}
            options={feeTypes.map((ft) => ({
              value: String(ft.id),
              label: ft.billing_period_display
                ? `${ft.name} (${ft.billing_period_display})`
                : ft.name,
            }))}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={openAdd}
          disabled={disabled}
          className="shrink-0 rounded-xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add fee type
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={openEdit}
          disabled={disabled || !value || !canEditSelected}
          title={
            !value
              ? 'Select a fee type first'
              : !canEditSelected
                ? 'Built-in fee types cannot be edited. Add your own fee type instead.'
                : 'Edit selected fee type'
          }
          className="shrink-0 rounded-xl border-white/10 bg-white/5 text-slate-200 hover:bg-white/10 disabled:opacity-40"
        >
          <Pencil className="mr-1.5 h-4 w-4" />
          Edit
        </Button>
      </div>
      {selected && !canEditSelected && (
        <p className="text-xs text-slate-500">
          This is a default fee type. Use <strong className="text-slate-400">Add fee type</strong> to create your own
          (e.g. Smart Class, Activity).
        </p>
      )}

      {modalMode && (
        <DashboardModal
          title={modalMode === 'add' ? 'Add fee type' : 'Edit fee type'}
          subtitle="Fee types define billing period (monthly, yearly, one-time, etc.)."
          onClose={closeModal}
        >
          <div className="space-y-4">
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div>
              <label className={dash.label}>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className={dash.field}
                placeholder="e.g. Smart Class, Activity Fee"
                autoFocus
              />
            </div>
            <div>
              <label className={dash.label}>Billing period</label>
              <DashboardSelect
                value={form.billing_period}
                onChange={(v) => setForm((f) => ({ ...f, billing_period: v }))}
                options={BILLING_PERIODS.map((p) => ({ value: p.value, label: p.label }))}
              />
            </div>
            <div>
              <label className={dash.label}>Description (optional)</label>
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className={dash.field}
                placeholder="Short note for staff"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
              >
                {saving ? 'Saving…' : modalMode === 'add' ? 'Create fee type' : 'Save changes'}
              </Button>
              <button type="button" onClick={closeModal} className="text-sm text-slate-400 hover:text-slate-200">
                Cancel
              </button>
            </div>
          </div>
        </DashboardModal>
      )}
    </div>
  );
}
