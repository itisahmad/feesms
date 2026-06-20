'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CreditCard, Download } from 'lucide-react';
import { GlassCard } from '@/components/dashboard/page-shell';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import type { StudentMonthlyHistory, StudentYearlyPayment } from './types';
import { MONTHS, downloadStudentFeeReceipt, monthPendingTotal } from './utils';

type StudentPaymentsSectionProps = {
  monthlyHistory: StudentMonthlyHistory[];
  yearlyPayments?: StudentYearlyPayment[];
  studentName: string;
  readOnly?: boolean;
  allowParentOnlinePayment?: boolean;
  id?: string;
  onMonthlyReceipt?: (month: number, year: number) => void;
  onDownloadMonthReceipt?: (month: number, year: number) => Promise<void>;
  onDownloadReceipt?: (feeId: number, feeType: string, month: number, year: number) => Promise<void>;
  onPayMonthOnline?: (month: number, year: number) => void;
};

function defaultExpandedMonths(monthlyHistory: StudentMonthlyHistory[]): Set<string> {
  const expanded = new Set<string>();
  const current = monthlyHistory.find((m) => m.is_current);
  if (current) {
    expanded.add(`${current.year}-${current.month}`);
    return expanded;
  }
  const firstUnpaid = monthlyHistory.find((m) => m.can_pay);
  if (firstUnpaid) {
    expanded.add(`${firstUnpaid.year}-${firstUnpaid.month}`);
    return expanded;
  }
  if (monthlyHistory[0]) {
    expanded.add(`${monthlyHistory[0].year}-${monthlyHistory[0].month}`);
  }
  return expanded;
}

export function StudentPaymentsSection({
  monthlyHistory,
  yearlyPayments = [],
  studentName,
  readOnly = false,
  allowParentOnlinePayment = false,
  id,
  onMonthlyReceipt,
  onDownloadMonthReceipt,
  onDownloadReceipt,
  onPayMonthOnline,
}: StudentPaymentsSectionProps) {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() =>
    defaultExpandedMonths(monthlyHistory),
  );

  const monthKeys = useMemo(
    () => monthlyHistory.map((m) => `${m.year}-${m.month}`).join(','),
    [monthlyHistory],
  );

  useEffect(() => {
    setExpandedMonths(defaultExpandedMonths(monthlyHistory));
  }, [monthKeys, monthlyHistory]);

  const toggleMonth = (year: number, month: number) => {
    const key = `${year}-${month}`;
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleDownloadMonthReceipt = async (month: number, year: number) => {
    const monthKey = `${year}-${month}`;
    setDownloadingMonth(monthKey);
    try {
      if (onDownloadMonthReceipt) {
        await onDownloadMonthReceipt(month, year);
      } else if (onMonthlyReceipt) {
        onMonthlyReceipt(month, year);
      }
    } catch {
      alert('Failed to download receipt');
    } finally {
      setDownloadingMonth(null);
    }
  };

  const handleDownloadFeeReceipt = async (feeId: number, feeType: string, month: number, year: number) => {
    setDownloadingId(feeId);
    try {
      const safeName = studentName.replace(/\s+/g, '-').slice(0, 30);
      const filename = `receipt-${safeName}-${feeType}-${MONTHS[month]}-${year}.pdf`;
      if (onDownloadReceipt) {
        await onDownloadReceipt(feeId, feeType, month, year);
      } else {
        await downloadStudentFeeReceipt(feeId, filename);
      }
    } catch {
      alert('Failed to download receipt');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <GlassCard delay={0.12} className={id ? 'scroll-mt-24' : undefined}>
      <div id={id} className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-white">Payments &amp; receipts</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">Payment history by month</p>
      </div>

      {yearlyPayments.length > 0 ? (
        <div className="border-b border-white/10 bg-teal-500/10 px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-slate-200">Yearly payments</h3>
          <div className="space-y-2">
            {yearlyPayments.map((yp, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                <span className="text-slate-300">{yp.fee_type} – Yearly</span>
                <span className="font-medium text-teal-300">
                  ₹{yp.total.toLocaleString('en-IN')} on {yp.date} ({yp.mode})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {monthlyHistory.length === 0 ? (
        <div className={cn(dash.empty, 'py-8')}>No fee records yet.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {monthlyHistory.map((m, mi) => {
            const monthKey = `${m.year}-${m.month}`;
            const isExpanded = expandedMonths.has(monthKey);
            const canDownloadMonth =
              m.total_paid > 0 && (onDownloadMonthReceipt || onMonthlyReceipt);
            const monthPending = monthPendingTotal(m);
            const canPayMonthOnline =
              allowParentOnlinePayment &&
              monthPending > 0 &&
              (m.can_pay ?? monthPending > 0) &&
              onPayMonthOnline;

            return (
              <motion.div
                key={monthKey}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.02 + mi * 0.01 }}
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleMonth(m.year, m.month)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left transition-colors hover:opacity-90"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 text-slate-500 transition-transform',
                          isExpanded && 'rotate-180',
                        )}
                      />
                      <h3 className="font-medium text-slate-200">
                        {MONTHS[m.month]} {m.year}
                      </h3>
                      {m.is_current && monthPending > 0 ? (
                        <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-xs text-teal-300">
                          Current
                        </span>
                      ) : null}
                      {m.can_pay ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">
                          Payment due
                        </span>
                      ) : m.total_paid > 0 ? (
                        <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs text-teal-300/90">
                          Paid
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-sm text-slate-400">
                      Due ₹{m.total_due.toLocaleString('en-IN')} · Paid ₹{m.total_paid.toLocaleString('en-IN')}
                    </span>
                  </button>
                  {canDownloadMonth ? (
                    <button
                      type="button"
                      disabled={downloadingMonth === monthKey}
                      onClick={() => handleDownloadMonthReceipt(m.month, m.year)}
                      className={cn(
                        dash.link,
                        'inline-flex shrink-0 items-center gap-1 text-xs disabled:opacity-50',
                      )}
                    >
                      <Download className="h-3.5 w-3.5" />
                      {downloadingMonth === monthKey ? 'Downloading…' : 'Receipt'}
                    </button>
                  ) : null}
                  {canPayMonthOnline ? (
                    <button
                      type="button"
                      onClick={() => onPayMonthOnline!(m.month, m.year)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-teal-500/30 bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-200 transition hover:bg-teal-500/25"
                    >
                      <CreditCard className="h-3.5 w-3.5" />
                      Pay online
                    </button>
                  ) : null}
                </div>

                <AnimatePresence initial={false}>
                  {isExpanded ? (
                    <motion.div
                      key={`${monthKey}-body`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2 px-4 pb-4">
                        {m.fees.map((f) => {
                          const canDownload =
                            (f.can_download_receipt ?? f.paid > 0) && (!readOnly || onDownloadReceipt);

                          return (
                            <div
                              key={f.id}
                              className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <span className="font-medium text-slate-200">{f.fee_type}</span>
                                  <p className="mt-1 text-sm text-slate-500">
                                    Paid ₹{f.paid.toLocaleString('en-IN')} of ₹{f.total.toLocaleString('en-IN')}
                                    {f.late_fine != null && f.late_fine > 0 ? (
                                      <span className="text-rose-300/90">
                                        {' '}
                                        (incl. late fine ₹{f.late_fine.toLocaleString('en-IN')})
                                      </span>
                                    ) : null}
                                  </p>
                                  {f.is_payable ?? f.balance > 0 ? (
                                    <p className="text-sm text-amber-400">
                                      ₹{f.balance.toLocaleString('en-IN')} pending
                                    </p>
                                  ) : f.balance > 0 ? null : (
                                    <p className="text-sm text-teal-400/90">Fully paid</p>
                                  )}
                                </div>
                                {canDownload ? (
                                  <button
                                    type="button"
                                    disabled={downloadingId === f.id}
                                    onClick={() =>
                                      handleDownloadFeeReceipt(f.id, f.fee_type, m.month, m.year)
                                    }
                                    className={cn(
                                      dash.link,
                                      'inline-flex shrink-0 items-center gap-1 text-xs disabled:opacity-50',
                                    )}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                    {downloadingId === f.id ? 'Downloading…' : 'Receipt'}
                                  </button>
                                ) : null}
                              </div>

                              {f.payments.length > 0 ? (
                                <ul className="mt-2 space-y-1 border-t border-white/5 pt-2 text-xs text-slate-400">
                                  {f.payments.map((p, pi) => (
                                    <li key={pi}>
                                      ₹{p.amount.toLocaleString('en-IN')} on {p.date} ({p.mode})
                                      {p.is_yearly ? ' · Yearly payment' : ''}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
