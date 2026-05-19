export type FeeBreakdownItem = {
  fee_type: string;
  fee_structure_id?: number;
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

export type PayMode = 'monthly' | 'yearly';

export type FeeStructureOption = {
  id: number;
  fee_type_name: string;
  billing_period_display?: string;
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

export function sameFeeStructureIdList(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export function filterBreakdownBySelection(
  breakdown: FeeBreakdownItem[],
  selectedIds: number[]
): FeeBreakdownItem[] {
  if (!selectedIds.length) return [];
  const set = new Set(selectedIds);
  return breakdown.filter((b) => b.fee_structure_id != null && set.has(b.fee_structure_id));
}

export function computeSelectedMonthlyTotal(
  preview: PaymentPreview | null,
  selectedIds: number[]
): number {
  if (!preview) return 0;
  return filterBreakdownBySelection(preview.monthly.breakdown, selectedIds).reduce(
    (sum, f) => sum + f.balance,
    0
  );
}

export function computeSelectedYearlyTotals(
  preview: PaymentPreview | null,
  selectedIds: number[]
): { amount: number; amountBeforeDiscount: number } {
  if (!preview) return { amount: 0, amountBeforeDiscount: 0 };
  const items = filterBreakdownBySelection(preview.yearly.breakdown, selectedIds);
  return {
    amount: items.reduce((sum, f) => sum + (f.after_discount ?? f.balance), 0),
    amountBeforeDiscount: items.reduce((sum, f) => sum + f.balance, 0),
  };
}

export function getPreviewBaseTotal(
  preview: PaymentPreview | null,
  payMode: PayMode,
  selectedIds: number[]
): number {
  if (!preview) return 0;
  if (payMode === 'yearly') return computeSelectedYearlyTotals(preview, selectedIds).amount;
  return computeSelectedMonthlyTotal(preview, selectedIds);
}

/** Keep paid IDs stable across preview refetches (paid list is class-wide, not selection-scoped). */
export function mergeFeeStructureIds(existing: number[], incoming: number[]): number[] {
  if (!incoming.length) return existing;
  return Array.from(new Set([...existing, ...incoming]));
}

/** Default checkboxes: assigned + payable, excluding already-paid types. */
export function buildDefaultSelectedFeeIds(
  assignedIds: number[],
  classFeeIds: number[],
  payableIds: number[],
  paidIds: number[]
): number[] {
  const validAssigned = assignedIds.filter((id) => classFeeIds.includes(id));
  const paidSet = new Set(paidIds);
  if (payableIds.length) {
    return validAssigned.filter((id) => payableIds.includes(id) && !paidSet.has(id));
  }
  return validAssigned.filter((id) => !paidSet.has(id));
}

export function selectedIdsKey(ids: number[]): string {
  return [...ids].sort((a, b) => a - b).join(',');
}
