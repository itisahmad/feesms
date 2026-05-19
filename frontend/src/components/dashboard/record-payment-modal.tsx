'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  payAllPending,
  payAllYear,
  getFeeStructures,
  createFeeCollectionOrder,
  verifyFeeCollectionPayment,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { DashboardModal } from '@/components/dashboard/modal';
import { BreakupPanel } from '@/components/dashboard/record-payment/breakup-panel';
import { FeeTypeList } from '@/components/dashboard/record-payment/fee-type-list';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import {
  adjustmentHasAmount,
  buildAdjustmentPayload,
  buildDefaultSelectedFeeIds,
  computeTotalWithAdjustment,
  getPreviewBaseTotal,
  isFeeStructurePaid,
  type FeeStructureOption,
  type PayMode,
} from '@/lib/fee-payment';
import { useRecordPaymentPreview } from '@/hooks/use-record-payment-preview';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export type RecordPaymentStudent = {
  student_id: number;
  student_name: string;
  school_class_id?: number | null;
  assigned_fee_structure_ids?: number[];
  parent_phone: string;
};

type RecordPaymentModalProps = {
  student: RecordPaymentStudent;
  month: number;
  year: number;
  initialPayMode?: PayMode;
  onClose: () => void;
  onPaid: () => void;
};

function filterClassFeesByAcademicYear(
  list: { id: number; fee_type_name: string; amount: string; billing_period_display?: string; academic_year?: string }[],
  month: number,
  year: number,
  startMonth: number
): FeeStructureOption[] {
  const startYear = month >= startMonth ? year : year - 1;
  const endYear = startYear + 1;
  const currentAcademicYear = `${startYear}-${String(endYear).slice(-2)}`;
  return list
    .filter((f) => !f.academic_year || f.academic_year === currentAcademicYear)
    .map((f) => ({
      id: f.id,
      fee_type_name: f.fee_type_name,
      billing_period_display: f.billing_period_display,
    }));
}

export function RecordPaymentModal({
  student,
  month,
  year,
  initialPayMode = 'monthly',
  onClose,
  onPaid,
}: RecordPaymentModalProps) {
  const [payMode, setPayMode] = useState<PayMode>(initialPayMode);
  const [classFeeOptions, setClassFeeOptions] = useState<FeeStructureOption[]>([]);
  const [feesLoading, setFeesLoading] = useState(true);
  const [selectedFeeStructureIds, setSelectedFeeStructureIds] = useState<number[]>([]);
  const [selectionInitialized, setSelectionInitialized] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'' | 'add' | 'subtract'>('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    payment_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'Cash',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const allClassFeeStructureIds = useMemo(() => classFeeOptions.map((f) => f.id), [classFeeOptions]);

  const handlePreviewBootstrap = useCallback(
    ({ paidFeeStructureIds, payableFeeStructureIds }: { paidFeeStructureIds: number[]; payableFeeStructureIds: number[] }) => {
      const assigned = Array.from(
        new Set((student.assigned_fee_structure_ids || []).filter((id): id is number => typeof id === 'number'))
      );
      const defaults = buildDefaultSelectedFeeIds(
        assigned,
        allClassFeeStructureIds,
        payableFeeStructureIds,
        paidFeeStructureIds
      );
      setSelectedFeeStructureIds(defaults);
      setSelectionInitialized(true);
    },
    [student.assigned_fee_structure_ids, allClassFeeStructureIds]
  );

  const { paymentPreview, paidFeeStructureIds, feeMetaReady, breakupLoading } = useRecordPaymentPreview({
    studentId: student.student_id,
    month,
    year,
    payMode,
    allClassFeeStructureIds,
    selectedFeeStructureIds,
    selectionInitialized,
    onBootstrap: handlePreviewBootstrap,
  });

  useEffect(() => {
    setFeesLoading(true);
    setSelectionInitialized(false);
    setSelectedFeeStructureIds([]);

    if (!student.school_class_id) {
      setClassFeeOptions([]);
      setFeesLoading(false);
      return;
    }

    getFeeStructures(student.school_class_id)
      .then(({ data }) => {
        const list = (data.results || data) as {
          id: number;
          fee_type_name: string;
          amount: string;
          billing_period_display?: string;
          academic_year?: string;
        }[];
        const startMonth = data?.academic_year_start_month || 4;
        setClassFeeOptions(filterClassFeesByAcademicYear(list, month, year, startMonth));
      })
      .catch(() => setClassFeeOptions([]))
      .finally(() => setFeesLoading(false));
  }, [student.student_id, student.school_class_id, month, year]);

  const basePayAmount = getPreviewBaseTotal(paymentPreview, payMode, selectedFeeStructureIds);
  const displayPayAmount = computeTotalWithAdjustment(basePayAmount, adjustmentType, adjustmentAmount);
  const feeTypesLoading = feesLoading || !feeMetaReady || !selectionInitialized;
  const canSubmit = feeMetaReady && selectionInitialized && !breakupLoading && paymentPreview != null;

  const toggleFeeStructure = (feeStructureId: number, currentlyChecked: boolean) => {
    if (isFeeStructurePaid(feeStructureId, paidFeeStructureIds)) return;
    setSelectedFeeStructureIds((prev) =>
      currentlyChecked ? prev.filter((id) => id !== feeStructureId) : [...prev, feeStructureId]
    );
  };

  const loadRazorpayScript = () =>
    new Promise<boolean>((resolve) => {
      if (typeof window !== 'undefined' && window.Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  const handlePayAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adjustmentHasAmount(adjustmentType, adjustmentAmount) && !adjustmentNotes.trim()) {
      alert('Notes are required when using a payment adjustment');
      return;
    }
    const payableSelected = selectedFeeStructureIds.filter((id) => !isFeeStructurePaid(id, paidFeeStructureIds));
    if (!payableSelected.length) {
      alert('Select at least one unpaid fee type');
      return;
    }
    if (basePayAmount <= 0 && !adjustmentHasAmount(adjustmentType, adjustmentAmount)) {
      alert('No amount due for the selected fee types');
      return;
    }

    setSaving(true);
    try {
      const adjustmentPayload = buildAdjustmentPayload(adjustmentType, adjustmentAmount, adjustmentNotes);
      const executePayment = async (mode: string, transactionId?: string) => {
        const baseNotes =
          paymentForm.notes ||
          (payMode === 'yearly' ? 'Full year payment (selected fee types)' : 'Monthly payment (selected fee types)');
        const notes = transactionId ? `${baseNotes} | Razorpay: ${transactionId}` : baseNotes;

        if (payMode === 'yearly') {
          await payAllYear({
            student_id: student.student_id,
            month,
            year,
            payment_date: paymentForm.payment_date,
            payment_mode: mode,
            notes,
            fee_structure_ids: payableSelected,
            ...adjustmentPayload,
          });
        } else {
          await payAllPending({
            student_id: student.student_id,
            month,
            year,
            payment_date: paymentForm.payment_date,
            payment_mode: mode,
            notes,
            only_this_month: true,
            fee_structure_ids: payableSelected,
            ...adjustmentPayload,
          });
        }
      };

      if (paymentForm.payment_mode === 'Online') {
        const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!key) throw new Error('NEXT_PUBLIC_RAZORPAY_KEY_ID is missing');
        const scriptOk = await loadRazorpayScript();
        if (!scriptOk || !window.Razorpay) throw new Error('Failed to load Razorpay checkout');

        const { data: co } = await createFeeCollectionOrder({
          student_id: student.student_id,
          month,
          year,
          payment_date: paymentForm.payment_date,
          collection_mode: payMode,
          fee_structure_ids: payableSelected,
          notes: paymentForm.notes || undefined,
          ...adjustmentPayload,
        });

        await new Promise<void>((resolve, reject) => {
          const rz = new window.Razorpay({
            key,
            amount: co.amount_paise,
            currency: co.currency || 'INR',
            order_id: co.order_id,
            name: 'SchoolFee Pro',
            description: `${student.student_name} — fee payment`,
            handler: async (response: unknown) => {
              try {
                const r = response as {
                  razorpay_order_id?: string;
                  razorpay_payment_id?: string;
                  razorpay_signature?: string;
                };
                await verifyFeeCollectionPayment({
                  checkout_session_id: co.checkout_session_id,
                  razorpay_order_id: r.razorpay_order_id || co.order_id,
                  razorpay_payment_id: r.razorpay_payment_id || '',
                  razorpay_signature: r.razorpay_signature || '',
                });
                resolve();
              } catch (err) {
                reject(err);
              }
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled by the user')) },
            prefill: { name: student.student_name, contact: student.parent_phone },
            theme: { color: '#0f766e' },
          });
          rz.open();
        });
      } else {
        await executePayment('Cash');
      }

      onPaid();
      onClose();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string; detail?: string } } };
      const fallbackMessage = err instanceof Error ? err.message : 'Failed to record payment';
      alert(axErr?.response?.data?.error || axErr?.response?.data?.detail || fallbackMessage);
    } finally {
      setSaving(false);
    }
  };

  const adjustmentLabel = adjustmentHasAmount(adjustmentType, adjustmentAmount) ? (
    <div className="flex justify-between text-sm text-slate-400">
      <span>
        Adjustment ({adjustmentType === 'add' ? '+' : '−'}₹{parseFloat(adjustmentAmount).toLocaleString('en-IN')})
      </span>
      <span className={adjustmentType === 'add' ? 'text-emerald-400' : 'text-rose-400'}>
        {adjustmentType === 'add' ? '+' : '−'}₹{parseFloat(adjustmentAmount).toLocaleString('en-IN')}
      </span>
    </div>
  ) : null;

  return (
    <DashboardModal
      title={`Record payment – ${student.student_name}`}
      subtitle="Choose monthly or yearly. Amount is calculated from selected fee types."
      onClose={onClose}
    >
      <motion.div className={cn(dash.innerPanel, 'mb-4 border-teal-500/20 bg-teal-500/5')}>
        <div className="flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="payMode"
              checked={payMode === 'monthly'}
              onChange={() => setPayMode('monthly')}
              className="border-white/20 bg-white/10 text-teal-500 accent-teal-500"
            />
            <span className="text-sm font-medium text-teal-200">Monthly</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="payMode"
              checked={payMode === 'yearly'}
              onChange={() => setPayMode('yearly')}
              className="border-white/20 bg-white/10 text-teal-500 accent-teal-500"
            />
            <span className="text-sm font-medium text-teal-200">Yearly</span>
          </label>
        </div>
      </motion.div>

      <motion.div className={cn(dash.innerPanel, 'mb-4')}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Fee types for this payment</div>
        <div className="max-h-36 space-y-2 overflow-y-auto">
          <FeeTypeList
            feeOptions={classFeeOptions}
            paidFeeStructureIds={paidFeeStructureIds}
            selectedFeeStructureIds={selectedFeeStructureIds}
            loading={feeTypesLoading}
            onToggle={toggleFeeStructure}
          />
        </div>
      </motion.div>

      <motion.div className={cn(dash.innerPanel, 'mb-4 border-teal-500/20 bg-teal-500/5')}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Breakup</div>
        <BreakupPanel
          payMode={payMode}
          month={month}
          year={year}
          paymentPreview={paymentPreview}
          selectedFeeStructureIds={selectedFeeStructureIds}
          feeTypesReady={!feeTypesLoading}
          breakupLoading={breakupLoading}
          displayPayAmount={displayPayAmount}
          adjustmentLabel={adjustmentLabel}
        />
      </motion.div>

      <motion.div className={cn(dash.innerPanel, 'mb-4')}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Adjustment (optional)</div>
        <div className="space-y-3">
          <DashboardSelect
            value={adjustmentType}
            onChange={(v) => {
              const next = v as '' | 'add' | 'subtract';
              setAdjustmentType(next);
              if (!next) {
                setAdjustmentAmount('');
                setAdjustmentNotes('');
              }
            }}
            allowEmpty
            emptyLabel="No adjustment"
            placeholder="No adjustment"
            options={[
              { value: 'add', label: 'Add to total (+)' },
              { value: 'subtract', label: 'Subtract from total (−)' },
            ]}
          />
          {adjustmentType && (
            <>
              <div>
                <label className={dash.label}>Adjustment amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustmentAmount}
                  onChange={(e) => setAdjustmentAmount(e.target.value)}
                  className={dash.field}
                  placeholder="0"
                />
              </div>
              <div>
                <label className={dash.label}>
                  Adjustment notes {adjustmentHasAmount(adjustmentType, adjustmentAmount) ? '(required)' : ''}
                </label>
                <input
                  value={adjustmentNotes}
                  onChange={(e) => setAdjustmentNotes(e.target.value)}
                  className={dash.field}
                  placeholder="Reason for adjustment"
                  required={adjustmentHasAmount(adjustmentType, adjustmentAmount)}
                />
              </div>
            </>
          )}
        </div>
      </motion.div>

      <form onSubmit={handlePayAll} className="space-y-4">
        <div>
          <label className={dash.label}>Date</label>
          <input
            type="date"
            value={paymentForm.payment_date}
            onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
            className={dash.field}
            required
          />
        </div>
        <div>
          <label className={dash.label}>Mode</label>
          <DashboardSelect
            value={paymentForm.payment_mode}
            onChange={(v) => setPaymentForm((f) => ({ ...f, payment_mode: v }))}
            options={[
              { value: 'Cash', label: 'Cash' },
              { value: 'Online', label: 'Online (Razorpay)' },
            ]}
          />
        </div>
        <div>
          <label className={dash.label}>Notes</label>
          <input
            value={paymentForm.notes}
            onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
            className={dash.field}
          />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            type="submit"
            disabled={saving || feeTypesLoading || !canSubmit}
            className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50"
          >
            {saving
              ? 'Processing...'
              : feeTypesLoading || breakupLoading
                ? 'Loading...'
                : `Pay ₹${displayPayAmount.toLocaleString('en-IN')}`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          >
            Cancel
          </Button>
        </div>
      </form>
    </DashboardModal>
  );
}
