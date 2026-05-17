'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, CalendarDays, ChevronRight, Layers } from 'lucide-react';
import {
  getCollectionSummary,
  getReceipt,
  generateFees,
  payAllPending,
  payAllYear,
  getPaymentPreview,
  getFeeStructures,
  createFeeCollectionOrder,
  verifyFeeCollectionPayment,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import {
  adjustmentHasAmount,
  buildAdjustmentPayload,
  computeTotalWithAdjustment,
  getPreviewBaseTotal,
  isFeeStructurePaid,
  sameFeeStructureIdList,
  type PaymentPreview,
} from '@/lib/fee-payment';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

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
  const [month, setMonth] = useState(initialMonth);
  const year = currentYear;
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [payAllStudent, setPayAllStudent] = useState<StudentSummary | null>(null);
  const [payMode, setPayMode] = useState<'monthly' | 'yearly' | 'all_pending'>('monthly');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [paymentPreview, setPaymentPreview] = useState<PaymentPreview | null>(null);
  const [classFeeOptions, setClassFeeOptions] = useState<{ id: number; fee_type_name: string; amount: string; billing_period_display?: string; academic_year?: string }[]>([]);
  const [selectedFeeStructureIds, setSelectedFeeStructureIds] = useState<number[]>([]);
  const [adjustmentType, setAdjustmentType] = useState<'' | 'add' | 'subtract'>('');
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [expandedFeeType, setExpandedFeeType] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'Cash',
    notes: '',
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateSuccess, setGenerateSuccess] = useState<string | null>(null);

  const closePayModal = () => {
    setPayAllStudent(null);
    setPayMode('monthly');
    setAdjustmentType('');
    setAdjustmentAmount('');
    setAdjustmentNotes('');
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

  useEffect(() => {
    if (payAllStudent) {
      if (payAllStudent.school_class_id) {
        getFeeStructures(payAllStudent.school_class_id)
          .then(({ data }) => {
            const list = (data.results || data) as { id: number; fee_type_name: string; amount: string; billing_period_display?: string; academic_year?: string }[];
            const startMonth = data?.academic_year_start_month || 4;
            const startYear = month >= startMonth ? year : year - 1;
            const endYear = startYear + 1;
            const currentAcademicYear = `${startYear}-${String(endYear).slice(-2)}`;
            const filteredByAcademicYear = list.filter((f) => !f.academic_year || f.academic_year === currentAcademicYear);
            setClassFeeOptions(filteredByAcademicYear);

            const studentAssignedIds = Array.from(
              new Set(
                (payAllStudent.assigned_fee_structure_ids || []).filter((id): id is number => typeof id === 'number')
              )
            );
            const validDefaults = studentAssignedIds.filter((id) => filteredByAcademicYear.some((opt) => opt.id === id));
            setSelectedFeeStructureIds(validDefaults);
          })
          .catch(() => {
            setClassFeeOptions([]);
            setSelectedFeeStructureIds([]);
          });
      } else {
        setClassFeeOptions([]);
        setSelectedFeeStructureIds([]);
      }
    } else {
      setClassFeeOptions([]);
      setSelectedFeeStructureIds([]);
    }
  }, [payAllStudent?.student_id, month, year]);

  useEffect(() => {
    if (!payAllStudent) {
      setPaymentPreview(null);
      setPreviewLoading(false);
      setExpandedFeeType(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    getPaymentPreview(
      payAllStudent.student_id,
      month,
      year,
      payMode === 'all_pending' ? undefined : selectedFeeStructureIds,
    )
      .then(({ data }) => {
        if (cancelled) return;
        setPaymentPreview(data);
        if (payMode === 'monthly' && data.payable_fee_structure_ids?.length) {
          const payable = data.payable_fee_structure_ids as number[];
          setSelectedFeeStructureIds((prev) => {
            const next = prev.filter((id) => payable.includes(id));
            return sameFeeStructureIdList(prev, next) ? prev : next;
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPaymentPreview(null);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [payAllStudent?.student_id, month, year, payMode, selectedFeeStructureIds]);

  const paidFeeStructureIds =
    payMode === 'monthly' ? paymentPreview?.paid_fee_structure_ids : undefined;

  const basePayAmount = payAllStudent
    ? getPreviewBaseTotal(paymentPreview, payMode, payAllStudent.total_pending)
    : 0;
  const displayPayAmount = computeTotalWithAdjustment(basePayAmount, adjustmentType, adjustmentAmount);

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

  const handlePayAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payAllStudent) return;
    if (adjustmentHasAmount(adjustmentType, adjustmentAmount) && !adjustmentNotes.trim()) {
      alert('Notes are required when using a payment adjustment');
      return;
    }
    setSaving(true);
    try {
      const adjustmentPayload = buildAdjustmentPayload(adjustmentType, adjustmentAmount, adjustmentNotes);
      const executePayment = async (mode: string, transactionId?: string) => {
        const baseNotes =
          paymentForm.notes ||
          (payMode === 'yearly'
            ? 'Full year payment (selected fee types)'
            : 'All pending payment');
        const notes = transactionId ? `${baseNotes} | Razorpay: ${transactionId}` : baseNotes;

        if (payMode === 'yearly') {
          await payAllYear({
            student_id: payAllStudent.student_id,
            month,
            year,
            payment_date: paymentForm.payment_date,
            payment_mode: mode,
            notes,
            fee_structure_ids: selectedFeeStructureIds,
            ...adjustmentPayload,
          });
        } else if (payMode === 'all_pending') {
          await payAllPending({
            student_id: payAllStudent.student_id,
            month,
            year,
            payment_date: paymentForm.payment_date,
            payment_mode: mode,
            notes,
            only_this_month: false,
            ...adjustmentPayload,
          });
        } else {
          await payAllPending({
            student_id: payAllStudent.student_id,
            month,
            year,
            payment_date: paymentForm.payment_date,
            payment_mode: mode,
            notes,
            only_this_month: true,
            fee_structure_ids: selectedFeeStructureIds,
            ...adjustmentPayload,
          });
        }
      };

      if (paymentForm.payment_mode === 'Online') {
        const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
        if (!key) {
          throw new Error('NEXT_PUBLIC_RAZORPAY_KEY_ID is missing');
        }
        const scriptOk = await loadRazorpayScript();
        if (!scriptOk || !window.Razorpay) {
          throw new Error('Failed to load Razorpay checkout');
        }

        const collection_mode =
          payMode === 'yearly' ? 'yearly' : payMode === 'all_pending' ? 'all_pending' : 'monthly';

        const { data: co } = await createFeeCollectionOrder({
          student_id: payAllStudent.student_id,
          month,
          year,
          payment_date: paymentForm.payment_date,
          collection_mode,
          fee_structure_ids: payMode === 'all_pending' ? undefined : selectedFeeStructureIds,
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
            description: `${payAllStudent.student_name} — fee payment`,
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
            modal: {
              ondismiss: () => reject(new Error('Payment cancelled by the user')),
            },
            prefill: {
              name: payAllStudent.student_name,
              contact: payAllStudent.parent_phone,
            },
            theme: { color: '#0f766e' },
          });
          rz.open();
        });
      } else {
        await executePayment('Cash');
      }

      setPaymentForm({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_mode: 'Cash', notes: '' });
      setPayAllStudent(null);
      setPayMode('monthly');
      setExpandedFeeType(null);
      loadData(true);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string; detail?: string } } };
      const fallbackMessage = err instanceof Error ? err.message : 'Failed to record payment';
      alert(axErr?.response?.data?.error || axErr?.response?.data?.detail || fallbackMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadReceipt = async (studentFeeId: number, studentName: string) => {
    try {
      const { data } = await getReceipt(studentFeeId);
      const url = URL.createObjectURL(new Blob([data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${studentName}-${month}-${year}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download receipt');
    }
  };

  const handlePrintReceipt = async (studentFeeId: number, studentName: string) => {
    try {
      const { data } = await getReceipt(studentFeeId);
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'width=800,height=600');
      if (win) {
        win.onload = () => setTimeout(() => win!.print(), 500);
      } else {
        handleDownloadReceipt(studentFeeId, studentName);
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      alert('Failed to print receipt');
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
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value, 10))}
            className={dash.fieldSm}
            aria-label="Reporting month"
          >
            {availableMonths.map(({ value, label }) => (
              <option key={value} value={value}>
                {label} {currentYear}
              </option>
            ))}
          </select>
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
                            {s.fees.some((f) => f.balance > 0) && (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPayAllStudent(s);
                                    setPayMode('monthly');
                                  }}
                                  className={dash.link}
                                >
                                  Pay
                                </button>
                                {s.detailed_status?.current_month_paid && !s.detailed_status?.academic_year_complete && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPayAllStudent(s);
                                      setPayMode('yearly');
                                    }}
                                    className="text-sm font-medium text-amber-400 transition hover:text-amber-300"
                                    title="Complete academic year payment with potential discounts"
                                  >
                                    Complete Year
                                  </button>
                                )}
                              </div>
                            )}
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
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handlePrintReceipt(f.student_fee_id, s.student_name);
                                              }}
                                              className="text-xs text-teal-400 underline-offset-4 hover:text-teal-300 hover:underline"
                                            >
                                              Print
                                            </button>
                                            <button
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDownloadReceipt(f.student_fee_id, s.student_name);
                                              }}
                                              className="text-xs text-slate-500 underline-offset-4 hover:text-slate-300 hover:underline"
                                            >
                                              Download
                                            </button>
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

      {payAllStudent && (
        <DashboardModal
          wide
          title={`Record payment – ${payAllStudent.student_name}`}
          subtitle="Choose monthly, yearly, or all pending (includes arrears). Amount is calculated from selected fee types."
          onClose={closePayModal}
        >
          <div className={cn(dash.innerPanel, 'mb-4 border-teal-500/20 bg-teal-500/5')}>
            <div className="flex flex-wrap gap-3">
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
              {payAllStudent && payAllStudent.detailed_status?.current_month_paid && !payAllStudent.detailed_status?.academic_year_complete && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="payMode"
                    checked={payMode === 'yearly'}
                    onChange={() => setPayMode('yearly')}
                    className="border-white/20 bg-white/10 text-teal-500 accent-teal-500"
                  />
                  <span className="text-sm font-medium text-teal-200">Yearly</span>
                  <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                    Complete Year
                  </span>
                </label>
              )}
              {payAllStudent && payAllStudent.detailed_status?.current_month_paid && (
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="payMode"
                    checked={payMode === 'yearly'}
                    onChange={() => setPayMode('yearly')}
                    className="border-white/20 bg-white/10 text-teal-500 accent-teal-500"
                  />
                  <span className="text-sm font-medium text-teal-200">Yearly</span>
                  <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-300">
                    Current Month Paid
                  </span>
                </label>
              )}
              {payAllStudent && (
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
              )}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'all_pending'}
                  onChange={() => setPayMode('all_pending')}
                  className="border-white/20 bg-white/10 text-teal-500 accent-teal-500"
                />
                <span className="text-sm font-medium text-teal-200">All pending</span>
              </label>
            </div>
          </div>

          {payMode === 'yearly' && payAllStudent.detailed_status?.current_month_paid && !payAllStudent.detailed_status?.academic_year_complete && (
            <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
              <div className="text-sm text-amber-200">
                <strong>Complete Academic Year Payment:</strong> Pay the remaining months of the academic year at once. This may
                include discounts for yearly payment and helps secure the student&apos;s fees for the entire year.
              </div>
            </div>
          )}
          {payAllStudent && (
            <div className={cn(dash.innerPanel, 'mb-4')}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Fee types for this payment</div>
              <div className="max-h-40 space-y-2 overflow-y-auto">
                {classFeeOptions.map((f) => {
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
                        {f.fee_type_name} {f.billing_period_display ? `(${f.billing_period_display})` : ''}
                        {isPaid && <span className="ml-2 text-xs font-medium text-emerald-400/90">Paid</span>}
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isPaid}
                        onChange={() => {
                          if (isPaid) return;
                          setSelectedFeeStructureIds((prev) =>
                            checked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                          );
                        }}
                        className="rounded border-white/20 bg-white/10 accent-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <div className={cn(dash.innerPanel, 'mb-4 border-teal-500/20 bg-teal-500/5')}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Breakup</div>
            <div className="max-h-40 space-y-1.5 overflow-y-auto text-sm">
              {payMode === 'all_pending' ? (
                payAllStudent.fees.filter((f) => f.balance > 0).length === 0 ? (
                  <span className="text-teal-400">No pending fees</span>
                ) : (
                  payAllStudent.fees
                    .filter((f) => f.balance > 0)
                    .sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - (b.year ?? 0) * 12 - (b.month ?? 0))
                    .map((f) => (
                      <div key={f.student_fee_id} className="flex justify-between gap-4">
                        <span className="text-slate-300">
                          {f.fee_type} {f.month && f.year ? `(${MONTHS[f.month]} ${f.year})` : ''}
                        </span>
                        <span className="font-medium text-amber-400">₹{f.balance.toLocaleString('en-IN')}</span>
                      </div>
                    ))
                )
              ) : previewLoading && !paymentPreview ? (
                <span className="text-slate-500">Loading...</span>
              ) : !paymentPreview ? (
                <span className="text-slate-500">No preview available</span>
              ) : payMode === 'monthly' ? (
                paymentPreview.monthly.breakdown.length === 0 ? (
                  <span className="text-teal-400">No fees for {MONTHS[month]} {year}</span>
                ) : (
                  paymentPreview.monthly.breakdown.map((f, i) => (
                    <div key={i} className="flex justify-between gap-4">
                      <span className="text-slate-300">
                        {f.fee_type} {f.month && f.year ? `(${MONTHS[f.month]} ${f.year})` : ''}
                      </span>
                      <span className="font-medium text-amber-400">₹{f.balance.toLocaleString('en-IN')}</span>
                    </div>
                  ))
                )
              ) : paymentPreview.yearly.breakdown.length === 0 ? (
                <span className="text-teal-400">No fees for full year</span>
              ) : (
                (() => {
                  const byFeeType = paymentPreview.yearly.breakdown.reduce((acc, f) => {
                    const key = f.fee_type;
                    if (!acc[key]) acc[key] = { items: [], totalBefore: 0, totalAfter: 0 };
                    acc[key].items.push(f);
                    acc[key].totalBefore += f.balance;
                    acc[key].totalAfter += f.after_discount ?? f.balance;
                    return acc;
                  }, {} as Record<string, { items: typeof paymentPreview.yearly.breakdown; totalBefore: number; totalAfter: number }>);
                  return Object.entries(byFeeType).map(([feeType, { items, totalBefore, totalAfter }]) => {
                    const hasDiscount = totalBefore > totalAfter;
                    const discountPct = hasDiscount && totalBefore > 0 ? Math.round(((totalBefore - totalAfter) / totalBefore) * 100) : 0;
                    return (
                      <div key={feeType} className="border-b border-teal-500/15 pb-1 last:border-0 last:pb-0">
                        <button
                          type="button"
                          onClick={() => setExpandedFeeType((prev) => (prev === feeType ? null : feeType))}
                          className="-mx-1 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition hover:bg-white/10"
                        >
                          <span className="flex items-center gap-1 font-medium text-slate-200">
                            <span
                              className={`inline-block text-xs transition-transform ${expandedFeeType === feeType ? 'rotate-90' : ''}`}
                            >
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
                              .map((f, i) => {
                                const itemHasDiscount = (f.after_discount ?? f.balance) < f.balance;
                                const itemPct =
                                  f.discount_percent ??
                                  (f.balance > 0 ? Math.round(((f.balance - (f.after_discount ?? f.balance)) / f.balance) * 100) : 0);
                                return (
                                  <div key={i} className="flex justify-between text-sm text-slate-400">
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
                  });
                })()
              )}
            </div>
            <div className="mt-3 space-y-1 border-t border-teal-500/20 pt-2">
              {payMode === 'all_pending' ? (
                <div className="flex justify-between font-semibold text-teal-300">
                  <span>All pending (up to {MONTHS[month]} {year})</span>
                  <span>₹{payAllStudent.total_pending.toLocaleString('en-IN')}</span>
                </div>
              ) : paymentPreview ? (
                payMode === 'monthly' ? (
                  <div className="flex justify-between font-semibold text-teal-300">
                    <span>
                      {MONTHS[month]} {year} only
                    </span>
                    <span>₹{paymentPreview.monthly.amount.toLocaleString('en-IN')}</span>
                  </div>
                ) : (
                  <>
                    <div
                      className={cn(
                        'flex justify-between',
                        (paymentPreview.yearly.amount_before_discount ?? 0) > paymentPreview.yearly.amount
                          ? 'text-sm text-slate-400'
                          : 'font-semibold text-teal-300'
                      )}
                    >
                      <span>Full academic year (all months)</span>
                      <span>₹{(paymentPreview.yearly.amount_before_discount ?? paymentPreview.yearly.amount).toLocaleString('en-IN')}</span>
                    </div>
                    {(paymentPreview.yearly.amount_before_discount ?? 0) > paymentPreview.yearly.amount && (
                      <div className="flex justify-between font-semibold text-teal-300">
                        <span>Discounted amount to pay</span>
                        <span>₹{paymentPreview.yearly.amount.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                  </>
                )
              ) : null}
              {adjustmentHasAmount(adjustmentType, adjustmentAmount) && (
                <div className="flex justify-between text-sm text-slate-400">
                  <span>
                    Adjustment ({adjustmentType === 'add' ? '+' : '−'}₹{parseFloat(adjustmentAmount).toLocaleString('en-IN')})
                  </span>
                  <span className={adjustmentType === 'add' ? 'text-emerald-400' : 'text-rose-400'}>
                    {adjustmentType === 'add' ? '+' : '−'}₹{parseFloat(adjustmentAmount).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
              {(paymentPreview || payMode === 'all_pending') && (
                <div className="flex justify-between border-t border-teal-500/20 pt-2 text-base font-bold text-teal-200">
                  <span>Amount to pay</span>
                  <span>₹{displayPayAmount.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>
          </div>
          <motion.div className={cn(dash.innerPanel, 'mb-4')}>
            <motion.div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Adjustment (optional)</motion.div>
            <motion.div className="space-y-3">
              <select
                value={adjustmentType}
                onChange={(e) => {
                  const v = e.target.value as '' | 'add' | 'subtract';
                  setAdjustmentType(v);
                  if (!v) {
                    setAdjustmentAmount('');
                    setAdjustmentNotes('');
                  }
                }}
                className={dash.field}
              >
                <option value="">No adjustment</option>
                <option value="add">Add to total (+)</option>
                <option value="subtract">Subtract from total (−)</option>
              </select>
              {adjustmentType && (
                <>
                  <motion.div>
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
                  </motion.div>
                  <motion.div>
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
                  </motion.div>
                </>
              )}
            </motion.div>
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
              <select
                value={paymentForm.payment_mode}
                onChange={(e) => setPaymentForm((f) => ({ ...f, payment_mode: e.target.value }))}
                className={dash.field}
              >
                <option value="Cash">Cash</option>
                <option value="Online">Online (Razorpay)</option>
              </select>
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
                disabled={saving || (payMode !== 'all_pending' && (previewLoading && !paymentPreview))}
                className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 disabled:opacity-50"
              >
                {saving
                  ? 'Processing...'
                  : payMode === 'all_pending' || paymentPreview
                    ? `Pay ₹${displayPayAmount.toLocaleString('en-IN')}`
                    : 'Loading...'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={closePayModal}
                className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DashboardModal>
      )}
    </PageShell>
  );
}
