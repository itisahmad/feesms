'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarDays, ChevronRight, Layers } from 'lucide-react';
import { getCollectionSummary, generateFees } from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { RecordPaymentModal } from '@/components/dashboard/record-payment-modal';
import { ReceiptPrintModal } from '@/components/dashboard/receipt-print-modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import type { PayMode } from '@/lib/fee-payment';

interface FeeBreakdown {
  student_fee_id: number;
  fee_structure_id?: number;
  fee_type: string;
  month?: number;
  year?: number;
  total: number;
  paid: number;
  balance: number;
  status: 'paid' | 'partial' | 'unpaid';
  allow_yearly_payment?: boolean;
  yearly_discount_percent?: number;
  academic_year?: string;
  billing_period?: string;
  amount_per_period?: number;
}

interface StudentSummary {
  student_id: number;
  student_name: string;
  class_name: string;
  school_class_id?: number | null;
  assigned_fee_structure_ids?: number[];
  parent_phone: string;
  fees: FeeBreakdown[];
  total_due: number;
  total_paid: number;
  total_pending: number;
  status: 'fully_paid' | 'partial' | 'unpaid';
  detailed_status?: {
    academic_year_complete: boolean;
    current_month_paid: boolean;
    current_month: number;
    current_year: number;
    has_current_month_fees: boolean;
  };
}

interface ClassSummary {
  class_name: string;
  total_due: number;
  total_paid: number;
  total_pending: number;
  student_count: number;
}

interface CollectionData {
  month: number;
  year: number;
  academic_year_start_month?: number;
  class_wise: ClassSummary[];
  student_wise: StudentSummary[];
  defaulters: StudentSummary[];
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ClassFeesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const className = decodeURIComponent((params.className as string) || '');
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const initialMonth = (() => {
    const qMonth = parseInt(searchParams.get('month') || '', 10);
    if (!Number.isNaN(qMonth) && qMonth >= 1 && qMonth <= currentMonth) {
      return qMonth;
    }
    return currentMonth;
  })();
  const initialYear = (() => {
    const qYear = parseInt(searchParams.get('year') || '', 10);
    if (!Number.isNaN(qYear) && qYear >= 2000 && qYear <= currentYear + 1) return qYear;
    return currentYear;
  })();
  const [month, setMonth] = useState(initialMonth);
  const year = initialYear;
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAllStudent, setPayAllStudent] = useState<StudentSummary | null>(null);
  const [payModalMode, setPayModalMode] = useState<PayMode>('monthly');
  const [receiptStudent, setReceiptStudent] = useState<StudentSummary | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);

  const loadData = (bustCache = false) => {
    setLoading(true);
    getCollectionSummary(month, year, bustCache)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [month, year]);

  const handleGenerateFees = async () => {
    setGenerating(true);
    setGenerateSuccess(null);
    try {
      const { data } = await generateFees(month, year);
      loadData(true);
      setGenerateSuccess(data?.message || `Created ${data?.created ?? 0} fee records`);
      setTimeout(() => setGenerateSuccess(null), 4000);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      alert(axErr?.response?.data?.error || 'Failed to generate fees');
    } finally {
      setGenerating(false);
    }
  };

  const classSummary = data?.class_wise.find((c) => c.class_name === className);
  const students = data?.student_wise.filter((s) => s.class_name === className) || [];

  const canGenerateFees = month === currentMonth;
  const availableMonths = MONTHS.slice(1, currentMonth + 1).map((m, i) => ({ value: i + 1, label: m }));

  return (
    <PageShell>
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <Link
          href={`/dashboard/fees?month=${month}`}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-teal-400 transition hover:text-teal-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Fee Collection
        </Link>
      </motion.div>

      <PageHeader
        icon={Layers}
        eyebrow={`Class roster · ${MONTHS[month]} ${year}`}
        title={className}
        highlight="Fees"
        subtitle={`All students in this class — fees up to ${MONTHS[month]} ${year} (includes previous dues).`}
      />

      <GlassCard delay={0.05}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className={cn(dash.sectionChip, 'flex items-center gap-1.5 px-3 py-2 font-medium')}>
            <CalendarDays className="h-3.5 w-3.5" />
            Current month ({MONTHS[currentMonth]} {currentYear})
          </div>
          <DashboardSelect
            value={String(month)}
            onChange={(v) => setMonth(parseInt(v, 10))}
            className={cn(dash.fieldSm, 'min-h-[38px] min-w-[140px] py-2')}
            aria-label="Reporting month"
            options={availableMonths.map(({ value, label }) => ({
              value: String(value),
              label: `${label} ${currentYear}`,
            }))}
          />
          <Button
            onClick={handleGenerateFees}
            disabled={generating || !canGenerateFees}
            title={!canGenerateFees ? 'Generate fees is not allowed for past months' : undefined}
            className="rounded-xl border-0 bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-50"
          >
            {generating ? 'Generating…' : 'Generate fees'}
          </Button>
          {!canGenerateFees && (
            <span className="text-xs text-slate-500 md:max-w-md">
              Viewing {MONTHS[month]} {year}. Generate fees only for current or future months.
            </span>
          )}
        </div>
      </GlassCard>

      {generateSuccess && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={dash.success}
          role="status"
        >
          {generateSuccess}
        </motion.div>
      )}

      <GlassCard delay={0.1}>
        {loading ? (
          <InlineLoading message="Loading class collection data…" />
        ) : !data ? (
          <p className={dash.empty}>Failed to load data.</p>
        ) : (
          <>
            {classSummary && (
              <div className="border-b border-white/10 px-6 py-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    { label: 'Total due', value: classSummary.total_due, accent: 'text-white' },
                    { label: 'Collected', value: classSummary.total_paid, accent: 'text-teal-400' },
                    {
                      label: 'Pending',
                      value: classSummary.total_pending,
                      accent: classSummary.total_pending > 0 ? 'text-amber-400' : 'text-slate-400',
                    },
                    { label: 'Students', value: classSummary.student_count, accent: 'text-white', isCount: true },
                  ].map((stat, i) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.06 + i * 0.04 }}
                      className="rounded-xl border border-white/10 bg-white/[0.03] p-5"
                    >
                      <p className="text-sm text-slate-500">{stat.label}</p>
                      <p className={cn('mt-1 text-2xl font-bold tabular-nums', stat.accent)}>
                        {stat.isCount ? stat.value : `₹${Number(stat.value).toLocaleString('en-IN')}`}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {students.length === 0 ? (
              <div className="p-12 text-center">
                <Layers className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <p className="text-sm text-slate-500">
                  No fee records for {className} up to {MONTHS[month]} {year}. Click &quot;Generate fees&quot; to create fee
                  records.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={dash.table}>
                  <thead className={dash.thead}>
                    <tr>
                      <th className={cn(dash.th, 'w-10')} aria-hidden />
                      <th className={dash.th}>Student</th>
                      <th className={cn(dash.th, 'text-right')}>Total</th>
                      <th className={cn(dash.th, 'text-right')}>Paid</th>
                      <th className={cn(dash.th, 'text-right')}>Pending</th>
                      <th className={cn(dash.th, 'text-center')}>Status</th>
                      <th className={dash.th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, rowIndex) => (
                      <React.Fragment key={s.student_id}>
                        <motion.tr
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 + Math.min(rowIndex, 14) * 0.025 }}
                          className={cn(
                            dash.tr,
                            'cursor-pointer',
                            expandedRow === s.student_id && 'bg-teal-500/[0.08]'
                          )}
                          onClick={() => setExpandedRow((prev) => (prev === s.student_id ? null : s.student_id))}
                        >
                          <td className={cn(dash.td, 'w-10')} onClick={(e) => e.stopPropagation()}>
                            <ChevronRight
                              className={cn('h-4 w-4 text-slate-500 transition-transform', expandedRow === s.student_id && 'rotate-90')}
                              aria-hidden
                            />
                          </td>
                          <td className={dash.td}>
                            <div>
                              <Link
                                href={`/dashboard/students/${s.student_id}`}
                                className="font-medium text-teal-400 hover:text-teal-300"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s.student_name}
                              </Link>
                              <p className="text-xs text-slate-500">{s.parent_phone}</p>
                            </div>
                          </td>
                          <td className={cn(dash.td, 'text-right tabular-nums')}>₹{s.total_due.toLocaleString('en-IN')}</td>
                          <td className={cn(dash.td, 'text-right tabular-nums text-teal-400')}>
                            ₹{s.total_paid.toLocaleString('en-IN')}
                          </td>
                          <td
                            className={cn(
                              dash.td,
                              'text-right tabular-nums font-medium',
                              s.total_pending > 0 ? 'text-amber-400' : 'text-slate-400'
                            )}
                          >
                            ₹{s.total_pending.toLocaleString('en-IN')}
                          </td>
                          <td className={cn(dash.td, 'text-center')}>
                            {(() => {
                              if (s.detailed_status?.academic_year_complete) {
                                return (
                                  <span
                                    className={cn(
                                      dash.badge,
                                      'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                    )}
                                    title="All academic year fees have been paid"
                                  >
                                    All Paid
                                  </span>
                                );
                              } else if (s.detailed_status?.current_month_paid) {
                                return (
                                  <span
                                    className={cn(
                                      dash.badge,
                                      'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
                                    )}
                                    title={`${MONTHS[s.detailed_status.current_month]} fees are paid, but some previous months may be pending`}
                                  >
                                    {MONTHS[s.detailed_status.current_month]} Paid
                                  </span>
                                );
                              } else if (s.status === 'fully_paid') {
                                return (
                                  <span
                                    className={cn(dash.badge, dash.badgeTeal)}
                                    title="All dues up to selected month are paid"
                                  >
                                    Paid
                                  </span>
                                );
                              } else if (s.status === 'partial') {
                                return (
                                  <span
                                    className={cn(dash.badge, dash.badgeAmber)}
                                    title="Some fees have been paid but there are still pending dues"
                                  >
                                    Partial
                                  </span>
                                );
                              } else {
                                return (
                                  <span
                                    className={cn(dash.badge, dash.badgeRed)}
                                    title="No payments received yet"
                                  >
                                    Unpaid
                                  </span>
                                );
                              }
                            })()}
                          </td>
                          <td className={dash.td} onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap items-center gap-2">
                              {s.fees.some((f) => f.balance > 0) && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayModalMode('monthly');
                                      setPayAllStudent(s);
                                    }}
                                    className={dash.link}
                                  >
                                    Pay
                                  </button>
                                  {s.detailed_status?.current_month_paid && !s.detailed_status?.academic_year_complete && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setPayModalMode('yearly');
                                        setPayAllStudent(s);
                                      }}
                                      className="text-sm font-medium text-amber-400 transition hover:text-amber-300"
                                      title="Complete academic year payment with potential discounts"
                                    >
                                      Complete Year
                                    </button>
                                  )}
                                </>
                              )}
                              {s.fees.some((f) => f.paid > 0) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReceiptStudent(s);
                                  }}
                                  className="text-sm font-medium text-slate-300 transition hover:text-teal-300"
                                >
                                  Receipt
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                        {expandedRow === s.student_id && (
                          <tr className="border-b border-white/5 bg-white/[0.02]">
                            <td colSpan={7} className="px-4 py-4">
                              <div className="space-y-2 pl-2 md:pl-6">
                                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                  Fee breakdown
                                </div>
                                {(() => {
                                  const unpaidFees = s.fees.filter((f) => f.balance > 0);
                                  if (unpaidFees.length === 0) {
                                    return <span className="text-sm text-teal-400">All paid</span>;
                                  }
                                  return Object.entries(
                                    unpaidFees.reduce((acc, f) => {
                                      const key = f.month && f.year ? `${f.year}-${String(f.month).padStart(2, '0')}` : 'other';
                                      (acc[key] = acc[key] || []).push(f);
                                      return acc;
                                    }, {} as Record<string, typeof s.fees>)
                                  )
                                    .sort(([a], [b]) => (a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b)))
                                    .map(([key, monthFees]) => (
                                      <div key={key}>
                                        {key !== 'other' && (
                                          <div className="mb-1.5 mt-2 border-b border-white/10 pb-1 text-xs font-semibold text-slate-500 first:mt-0">
                                            {MONTHS[parseInt(key.split('-')[1])]} {key.split('-')[0]}
                                          </div>
                                        )}
                                        {monthFees.map((f) => (
                                          <div key={f.student_fee_id} className="flex flex-wrap items-center gap-2 text-sm">
                                            <span className="text-slate-400">{f.fee_type}:</span>
                                            <span className="text-amber-400">₹{f.balance.toLocaleString('en-IN')} pending</span>
                                            {f.paid > 0 && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setReceiptStudent(s);
                                                }}
                                                className="text-xs text-teal-400 underline-offset-4 hover:text-teal-300 hover:underline"
                                              >
                                                Receipt
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ));
                                })()}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {receiptStudent && (
        <ReceiptPrintModal
          studentId={receiptStudent.student_id}
          studentName={receiptStudent.student_name}
          month={month}
          year={year}
          hasPaidFees={receiptStudent.fees.some((f) => f.paid > 0)}
          onClose={() => setReceiptStudent(null)}
        />
      )}

      {payAllStudent && (
        <RecordPaymentModal
          key={`${payAllStudent.student_id}-${payModalMode}`}
          student={payAllStudent}
          month={month}
          year={year}
          initialPayMode={payModalMode}
          onClose={() => setPayAllStudent(null)}
          onPaid={() => loadData(true)}
        />
      )}

    </PageShell>
  );
}
