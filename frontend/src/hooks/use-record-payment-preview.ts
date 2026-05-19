'use client';

import { useEffect, useRef, useState } from 'react';
import { getPaymentPreview } from '@/lib/api';
import {
  mergeFeeStructureIds,
  type PaymentPreview,
  type PayMode,
  selectedIdsKey,
} from '@/lib/fee-payment';

const BREAKUP_DEBOUNCE_MS = 120;

function breakupCacheKey(payMode: PayMode, ids: number[]): string {
  return `${payMode}:${selectedIdsKey(ids)}`;
}

type UseRecordPaymentPreviewArgs = {
  studentId: number;
  month: number;
  year: number;
  payMode: PayMode;
  allClassFeeStructureIds: number[];
  selectedFeeStructureIds: number[];
  selectionInitialized: boolean;
  onBootstrap?: (data: { paidFeeStructureIds: number[]; payableFeeStructureIds: number[] }) => void;
};

export function useRecordPaymentPreview({
  studentId,
  month,
  year,
  payMode,
  allClassFeeStructureIds,
  selectedFeeStructureIds,
  selectionInitialized,
  onBootstrap,
}: UseRecordPaymentPreviewArgs) {
  const [paymentPreview, setPaymentPreview] = useState<PaymentPreview | null>(null);
  const [paidFeeStructureIds, setPaidFeeStructureIds] = useState<number[]>([]);
  const [feeMetaReady, setFeeMetaReady] = useState(false);
  const [breakupLoading, setBreakupLoading] = useState(false);
  const onBootstrapRef = useRef(onBootstrap);
  const paidIdsRef = useRef<number[]>([]);
  const previewCacheRef = useRef<Map<string, PaymentPreview>>(new Map());
  const breakupRequestIdRef = useRef(0);
  onBootstrapRef.current = onBootstrap;
  paidIdsRef.current = paidFeeStructureIds;

  useEffect(() => {
    previewCacheRef.current.clear();
  }, [studentId, month, year, payMode]);

  useEffect(() => {
    if (!allClassFeeStructureIds.length) {
      setFeeMetaReady(false);
      setPaidFeeStructureIds([]);
      setPaymentPreview(null);
      return;
    }

    let cancelled = false;
    setFeeMetaReady(false);

    getPaymentPreview(studentId, month, year, allClassFeeStructureIds, { metaOnly: true })
      .then(({ data }) => {
        if (cancelled) return;
        const paid = (data.paid_fee_structure_ids ?? []) as number[];
        const payable = (data.payable_fee_structure_ids ?? []) as number[];
        setPaidFeeStructureIds(paid);
        paidIdsRef.current = paid;
        setFeeMetaReady(true);
        onBootstrapRef.current?.({ paidFeeStructureIds: paid, payableFeeStructureIds: payable });
      })
      .catch(() => {
        if (!cancelled) {
          setPaidFeeStructureIds([]);
          paidIdsRef.current = [];
          setFeeMetaReady(true);
          onBootstrapRef.current?.({ paidFeeStructureIds: [], payableFeeStructureIds: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, month, year, selectedIdsKey(allClassFeeStructureIds)]);

  useEffect(() => {
    if (!feeMetaReady || !selectionInitialized) {
      setBreakupLoading(false);
      return;
    }

    const paidSet = new Set(paidIdsRef.current);
    const payableSelected = selectedFeeStructureIds.filter((id) => !paidSet.has(id));
    if (!payableSelected.length) {
      setPaymentPreview({
        monthly: { amount: 0, breakdown: [] },
        yearly: { amount: 0, amount_before_discount: 0, breakdown: [] },
      });
      setBreakupLoading(false);
      return;
    }

    const cacheKey = breakupCacheKey(payMode, payableSelected);
    const cached = previewCacheRef.current.get(cacheKey);
    if (cached) {
      setPaymentPreview(cached);
      setBreakupLoading(false);
      return;
    }

    let cancelled = false;
    const requestId = ++breakupRequestIdRef.current;
    setBreakupLoading(true);

    const timer = window.setTimeout(() => {
      getPaymentPreview(studentId, month, year, payableSelected, { breakupMode: payMode })
        .then(({ data }) => {
          if (cancelled || requestId !== breakupRequestIdRef.current) return;
          previewCacheRef.current.set(cacheKey, data);
          setPaymentPreview(data);
          setPaidFeeStructureIds((prev) => {
            const next = mergeFeeStructureIds(prev, data.paid_fee_structure_ids ?? []);
            paidIdsRef.current = next;
            return next;
          });
        })
        .catch(() => {
          if (!cancelled && requestId === breakupRequestIdRef.current) setPaymentPreview(null);
        })
        .finally(() => {
          if (!cancelled && requestId === breakupRequestIdRef.current) setBreakupLoading(false);
        });
    }, BREAKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [feeMetaReady, selectionInitialized, studentId, month, year, payMode, selectedIdsKey(selectedFeeStructureIds)]);

  return {
    paymentPreview,
    paidFeeStructureIds,
    feeMetaReady,
    breakupLoading,
  };
}
