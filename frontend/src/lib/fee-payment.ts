export type FeeBreakdownItem = {
  fee_type: string;
  month?: number;
  year?: number;
  balance: number;
  after_discount?: number;
  discount_percent?: number;
};

export type PaymentPreview = {
  monthly: { amount: number; breakdown: FeeBreakdownItem[] };
  yearly: {
    amount: number;
    amount_before_discount?: number;
    breakdown: FeeBreakdownItem[];
  };
  payable_fee_structure_ids?: number[];
  paid_fee_structure_ids?: number[];
};

export function isFeeStructurePaid(feeStructureId: number, paidIds?: number[]): boolean {
  return !!paidIds?.includes(feeStructureId);
}

export type AdjustmentType = '' | 'add' | 'subtract';

export type PaymentAdjustmentPayload = {
  adjustment_type?: 'add' | 'subtract';
  adjustment_amount?: number;
  adjustment_notes?: string;
};

export function adjustmentHasAmount(adjType: AdjustmentType, adjAmount: string): boolean {
  const amt = parseFloat(adjAmount);
  return !!adjType && !Number.isNaN(amt) && amt > 0;
}

export function buildAdjustmentPayload(
  adjType: AdjustmentType,
  adjAmount: string,
  adjNotes: string
): PaymentAdjustmentPayload {
  if (!adjustmentHasAmount(adjType, adjAmount)) return {};
  return {
    adjustment_type: adjType as 'add' | 'subtract',
    adjustment_amount: parseFloat(adjAmount),
    adjustment_notes: adjNotes.trim(),
  };
}

export function computeTotalWithAdjustment(
  base: number,
  adjType: AdjustmentType,
  adjAmount: string
): number {
  const amt = parseFloat(adjAmount);
  if (!adjType || Number.isNaN(amt) || amt <= 0) return base;
  if (adjType === 'subtract') return Math.max(0, base - amt);
  return base + amt;
}

/** Same IDs in same order — avoids pointless state updates that retrigger preview fetches. */
export function sameFeeStructureIdList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function getPreviewBaseTotal(
  preview: PaymentPreview | null,
  payMode: 'monthly' | 'yearly' | 'all_pending',
  totalPending: number
): number {
  if (payMode === 'all_pending') return totalPending;
  if (!preview) return 0;
  if (payMode === 'yearly') return preview.yearly.amount;
  return preview.monthly.amount;
}
