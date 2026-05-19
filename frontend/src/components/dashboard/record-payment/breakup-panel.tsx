'use client';

import { useState } from 'react';
import {
  computeSelectedMonthlyTotal,
  computeSelectedYearlyTotals,
  filterBreakdownBySelection,
  type FeeBreakdownItem,
  type PaymentPreview,
  type PayMode,
} from '@/lib/fee-payment';
import { cn } from '@/lib/utils';
import { RecordPaymentLoadingLine } from './loading-line';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type BreakupPanelProps = {
  payMode: PayMode;
  month: number;
  year: number;
  paymentPreview: PaymentPreview | null;
  selectedFeeStructureIds: number[];
  feeTypesReady: boolean;
  breakupLoading: boolean;
  displayPayAmount: number;
  adjustmentLabel?: React.ReactNode;
};

function groupYearlyByFeeType(breakdown: FeeBreakdownItem[]) {
  return breakdown.reduce(
    (acc, f) => {
      const key = f.fee_type;
      if (!acc[key]) acc[key] = { items: [], totalBefore: 0, totalAfter: 0 };
      acc[key].items.push(f);
      acc[key].totalBefore += f.balance;
      acc[key].totalAfter += f.after_discount ?? f.balance;
      return acc;
    },
    {} as Record<string, { items: FeeBreakdownItem[]; totalBefore: number; totalAfter: number }>
  );
}

function BreakupLines({
  payMode,
  month,
  year,
  paymentPreview,
  selectedFeeStructureIds,
}: Pick<BreakupPanelProps, 'payMode' | 'month' | 'year' | 'paymentPreview' | 'selectedFeeStructureIds'>) {
  const [expandedFeeType, setExpandedFeeType] = useState<string | null>(null);

  const monthlyBreakdown = paymentPreview
    ? filterBreakdownBySelection(paymentPreview.monthly.breakdown, selectedFeeStructureIds)
    : [];
  const yearlyBreakdown = paymentPreview
    ? filterBreakdownBySelection(paymentPreview.yearly.breakdown, selectedFeeStructureIds)
    : [];

  if (!paymentPreview) {
    return <span className="text-slate-500">Select fee types to see breakup</span>;
  }

  if (payMode === 'monthly') {
    if (!monthlyBreakdown.length) {
      return <span className="text-teal-400">No pending amount for {MONTHS[month]} {year}</span>;
    }
    return (
      <>
        {monthlyBreakdown.map((f, idx) => (
          <div key={idx} className="flex justify-between gap-4">
            <span className="text-slate-300">
              {f.fee_type} {f.month && f.year ? `(${MONTHS[f.month]} ${f.year})` : ''}
            </span>
            <span className="font-medium text-amber-400">₹{f.balance.toLocaleString('en-IN')}</span>
          </div>
        ))}
      </>
    );
  }

  if (!yearlyBreakdown.length) {
    return <span className="text-teal-400">No pending amount for full year</span>;
  }

  return (
    <>
      {Object.entries(groupYearlyByFeeType(yearlyBreakdown)).map(([feeType, { items, totalBefore, totalAfter }]) => {
        const hasDiscount = totalBefore > totalAfter;
        const discountPct =
          hasDiscount && totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
        return (
          <div key={feeType} className="border-b border-teal-500/15 pb-1 last:border-0 last:pb-0">
            <button
              type="button"
              onClick={() => setExpandedFeeType((prev) => (prev === feeType ? null : feeType))}
              className="-mx-1 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition hover:bg-white/10"
            >
              <span className="flex items-center gap-1 font-medium text-slate-200">
                <span className={`inline-block text-xs transition-transform ${expandedFeeType === feeType ? 'rotate-90' : ''}`}>
                  ▶
                </span>
                {feeType}
              </span>
              <span className="text-right">
                {hasDiscount ? (
                  <>
                    <span className="mr-1 text-sm text-slate-500 line-through">₹{totalBefore.toLocaleString('en-IN')}</span>
                    <span className="font-medium text-emerald-400">₹{totalAfter.toLocaleString('en-IN')}</span>
                    <span className="ml-1 text-xs text-emerald-400">({discountPct}% off)</span>
                  </>
                ) : (
                  <span className="font-medium text-amber-400">₹{totalAfter.toLocaleString('en-IN')}</span>
                )}
              </span>
            </button>
            {expandedFeeType === feeType && (
              <div className="ml-4 mt-1 space-y-0.5 border-l border-teal-500/30 pl-2">
                {items
                  .sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - (b.year ?? 0) * 12 - (b.month ?? 0))
                  .map((f, idx2) => {
                    const itemHasDiscount = (f.after_discount ?? f.balance) < f.balance;
                    const itemPct =
                      f.discount_percent ??
                      (f.balance > 0
                        ? Math.round(((f.balance - (f.after_discount ?? f.balance)) / f.balance) * 100)
                        : 0);
                    return (
                      <div key={idx2} className="flex justify-between text-sm text-slate-400">
                        <span>{f.month && f.year ? `${MONTHS[f.month]} ${f.year}` : 'Other'}</span>
                        {itemHasDiscount ? (
                          <span>
                            <span className="mr-1 text-slate-500 line-through">₹{f.balance.toLocaleString('en-IN')}</span>
                            <span>₹{(f.after_discount ?? f.balance).toLocaleString('en-IN')}</span>
                            <span className="ml-1 text-xs text-emerald-400">({itemPct}% off)</span>
                          </span>
                        ) : (
                          <span>₹{(f.after_discount ?? f.balance).toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function BreakupPanel({
  payMode,
  month,
  year,
  paymentPreview,
  selectedFeeStructureIds,
  feeTypesReady,
  breakupLoading,
  displayPayAmount,
  adjustmentLabel,
}: BreakupPanelProps) {
  const monthlyTotal = paymentPreview ? computeSelectedMonthlyTotal(paymentPreview, selectedFeeStructureIds) : 0;
  const yearlyTotals = paymentPreview ? computeSelectedYearlyTotals(paymentPreview, selectedFeeStructureIds) : null;

  if (!feeTypesReady) {
    return <span className="text-sm text-slate-500">Breakup will appear after fee types load.</span>;
  }

  return (
    <>
      <div className="max-h-36 space-y-1.5 overflow-y-auto text-sm">
        {breakupLoading ? (
          <RecordPaymentLoadingLine label="Calculating breakup…" />
        ) : (
          <BreakupLines
            payMode={payMode}
            month={month}
            year={year}
            paymentPreview={paymentPreview}
            selectedFeeStructureIds={selectedFeeStructureIds}
          />
        )}
      </div>
      {!breakupLoading && paymentPreview && (
        <div className="mt-3 space-y-1 border-t border-teal-500/20 pt-2">
          {payMode === 'monthly' ? (
            <div className="flex justify-between font-semibold text-teal-300">
              <span>
                {MONTHS[month]} {year} only
              </span>
              <span>₹{monthlyTotal.toLocaleString('en-IN')}</span>
            </div>
          ) : yearlyTotals ? (
            <>
              <div
                className={cn(
                  'flex justify-between',
                  yearlyTotals.amountBeforeDiscount > yearlyTotals.amount
                    ? 'text-sm text-slate-400'
                    : 'font-semibold text-teal-300'
                )}
              >
                <span>Full academic year (selected types)</span>
                <span>₹{yearlyTotals.amountBeforeDiscount.toLocaleString('en-IN')}</span>
              </div>
              {yearlyTotals.amountBeforeDiscount > yearlyTotals.amount && (
                <div className="flex justify-between font-semibold text-teal-300">
                  <span>Discounted amount to pay</span>
                  <span>₹{yearlyTotals.amount.toLocaleString('en-IN')}</span>
                </div>
              )}
            </>
          ) : null}
          {adjustmentLabel}
          <div className="flex justify-between border-t border-teal-500/20 pt-2 text-base font-bold text-teal-200">
            <span>Amount to pay</span>
            <span>₹{displayPayAmount.toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}
    </>
  );
}
