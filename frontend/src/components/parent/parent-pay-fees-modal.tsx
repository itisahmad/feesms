'use client';

import { useMemo, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { createParentChildPayment, createParentPaymentIntent, verifyParentChildPayment, verifyParentPayment } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import type { StudentMonthlyHistory } from '@/components/student-profile';
import { MONTHS } from '@/components/student-profile';

type PendingFeeRow = {
  id: number;
  fee_type: string;
  balance: number;
  month: number;
  year: number;
};

type PaymentChannel = 'parent' | 'staff';

type ParentPayFeesModalProps = {
  studentId: number;
  studentName: string;
  monthlyHistory: StudentMonthlyHistory[];
  filterMonth?: number;
  filterYear?: number;
  paymentChannel?: PaymentChannel;
  onClose: () => void;
  onPaid: () => void;
};

function collectPendingFees(
  monthlyHistory: StudentMonthlyHistory[],
  filterMonth?: number,
  filterYear?: number,
): PendingFeeRow[] {
  const rows: PendingFeeRow[] = [];
  for (const m of monthlyHistory) {
    if (filterMonth != null && filterYear != null && (m.month !== filterMonth || m.year !== filterYear)) {
      continue;
    }
    for (const f of m.fees) {
      if ((f.is_payable ?? f.balance > 0) && f.balance > 0) {
        rows.push({
          id: f.id,
          fee_type: f.fee_type,
          balance: f.balance,
          month: m.month,
          year: m.year,
        });
      }
    }
  }
  return rows;
}

export function ParentPayFeesModal({
  studentId,
  studentName,
  monthlyHistory,
  filterMonth,
  filterYear,
  paymentChannel = 'parent',
  onClose,
  onPaid,
}: ParentPayFeesModalProps) {
  const pendingFees = useMemo(
    () => collectPendingFees(monthlyHistory, filterMonth, filterYear),
    [monthlyHistory, filterMonth, filterYear],
  );
  const totalPending = useMemo(
    () => pendingFees.reduce((sum, row) => sum + row.balance, 0),
    [pendingFees],
  );
  const [payingId, setPayingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const title =
    filterMonth != null && filterYear != null
      ? `Pay ${MONTHS[filterMonth]} ${filterYear}`
      : 'Pay pending fees';

  const handlePayFee = async (row: PendingFeeRow) => {
    setError('');
    setPayingId(row.id);
    try {
      const { data } =
        paymentChannel === 'staff'
          ? await createParentPaymentIntent({
              student_fee_id: row.id,
              amount: row.balance,
              notes: `Online payment — ${row.fee_type} (${MONTHS[row.month]} ${row.year})`,
            })
          : await createParentChildPayment(studentId, row.id);
      await openRazorpayCheckout(
        data.order_id,
        data.amount_paise,
        async (resp) => {
          if (paymentChannel === 'staff') {
            await verifyParentPayment({
              intent_id: data.intent.id,
              ...resp,
              payment_mode: 'Online (Razorpay)',
            });
          } else {
            await verifyParentChildPayment(studentId, {
              intent_id: data.intent.id,
              ...resp,
              payment_mode: 'Online (Razorpay)',
            });
          }
        },
        {
          name: 'SchoolFee Pro',
          description: `${studentName} — ${row.fee_type} (${MONTHS[row.month]} ${row.year})`,
        },
      );
      onPaid();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = axErr?.response?.data?.error || axErr?.message;
      if (msg && msg !== 'Payment cancelled.') {
        setError(msg);
      }
    } finally {
      setPayingId(null);
    }
  };

  return (
    <DashboardModal
      title={title}
      subtitle={`Total pending: ₹${totalPending.toLocaleString('en-IN')}`}
      wide
      onClose={onClose}
    >
      {pendingFees.length === 0 ? (
        <p className="text-sm text-slate-400">No pending fees to pay.</p>
      ) : (
        <div className="space-y-3">
          {error ? <p className={dash.error}>{error}</p> : null}
          <p className="text-sm text-slate-400">
            Pay each fee line separately via Razorpay. Payment is recorded immediately after successful checkout.
          </p>
          <div className="divide-y divide-white/10 rounded-xl border border-white/10">
            {pendingFees.map((row) => (
              <div
                key={row.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-200">{row.fee_type}</p>
                  <p className="text-xs text-slate-500">
                    {MONTHS[row.month]} {row.year}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-amber-300">
                    ₹{row.balance.toLocaleString('en-IN')}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    disabled={payingId !== null}
                    onClick={() => handlePayFee(row)}
                    className="rounded-lg border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
                  >
                    {payingId === row.id ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        Processing…
                      </>
                    ) : (
                      <>
                        <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                        Pay
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className={cn(dash.link, 'text-sm')}>
          Close
        </button>
      </div>
    </DashboardModal>
  );
}
