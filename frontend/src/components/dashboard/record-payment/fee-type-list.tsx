'use client';

import { isFeeStructurePaid, type FeeStructureOption } from '@/lib/fee-payment';
import { cn } from '@/lib/utils';
import { RecordPaymentLoadingLine } from './loading-line';

type FeeTypeListProps = {
  feeOptions: FeeStructureOption[];
  paidFeeStructureIds: number[];
  selectedFeeStructureIds: number[];
  loading: boolean;
  onToggle: (feeStructureId: number, currentlyChecked: boolean) => void;
};

export function FeeTypeList({
  feeOptions,
  paidFeeStructureIds,
  selectedFeeStructureIds,
  loading,
  onToggle,
}: FeeTypeListProps) {
  if (loading) {
    return <RecordPaymentLoadingLine label="Loading fee types…" />;
  }

  if (!feeOptions.length) {
    return <span className="text-sm text-slate-500">No fee types for this class</span>;
  }

  return (
    <>
      {feeOptions.map((f) => {
        const isPaid = isFeeStructurePaid(f.id, paidFeeStructureIds);
        const checked = isPaid || selectedFeeStructureIds.includes(f.id);
        return (
          <label
            key={f.id}
            className={cn(
              'flex items-center justify-between gap-3 text-sm',
              isPaid ? 'cursor-default text-slate-500' : 'cursor-pointer text-slate-300'
            )}
          >
            <span>
              {f.fee_type_name}
              {f.billing_period_display ? ` (${f.billing_period_display})` : ''}
              {isPaid && <span className="ml-2 text-xs font-medium text-emerald-400/90">Paid</span>}
            </span>
            <input
              type="checkbox"
              checked={checked}
              disabled={isPaid}
              onChange={() => {
                if (isPaid) return;
                onToggle(f.id, checked);
              }}
              className="rounded border-white/20 bg-white/10 accent-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </label>
        );
      })}
    </>
  );
}
