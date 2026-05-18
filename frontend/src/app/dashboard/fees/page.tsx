'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Wallet, Layers, CalendarDays } from 'lucide-react';
import {
  getCollectionSummary,
  generateFees,
  payAllPending,
  payAllYear,
  getPaymentPreview,
  getFeeStructures,
  getSchool,
  createFeeCollectionOrder,
  verifyFeeCollectionPayment,
} from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { ReceiptPrintModal } from '@/components/dashboard/receipt-print-modal';
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

export default function FeesPage() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [month, setMonth] = useState(currentMonth);
  const [schoolCreatedAt, setSchoolCreatedAt] = useState<string | null>(null);
  const year = currentYear;
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'summary' | 'students' | 'defaulters'>('summary');
  const [classFilter, setClassFilter] = useState('');
  const [payAllStudent, setPayAllStudent] = useState<StudentSummary | null>(null);
  const [receiptStudent, setReceiptStudent] = useState<StudentSummary | null>(null);
  const [payMode, setPayMode] = useState<'monthly' | 'yearly' | 'all_pending'>('monthly');
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
    getSchool()
      .then(({ data }) => {
        const list = data.results || data;
        const school = Array.isArray(list) ? list[0] : list;
        setSchoolCreatedAt(school?.created_at || null);
      })
      .catch(() => setSchoolCreatedAt(null));
  }, []);

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

  const filteredStudents = data?.student_wise.filter((s) => !classFilter || s.class_name.startsWith(classFilter)) || [];
  const defaulters = data?.defaulters.filter((s) => !classFilter || s.class_name.startsWith(classFilter)) || [];

  const canGenerateFees = month === currentMonth;
  const schoolCreatedDate = schoolCreatedAt ? new Date(schoolCreatedAt) : null;
  const firstAvailableMonth =
    schoolCreatedDate && schoolCreatedDate.getFullYear() === currentYear
      ? schoolCreatedDate.getMonth() + 1
      : 1;
  const availableMonths = MONTHS.slice(firstAvailableMonth, currentMonth + 1).map((label, index) => ({
    value: firstAvailableMonth + index,
    label,
  }));

  useEffect(() => {
    if (month < firstAvailableMonth) {
      setMonth(firstAvailableMonth);
    }
  }, [month, firstAvailableMonth]);

  return (
    <PageShell>
      <PageHeader
        icon={Wallet}
        eyebrow={`Collection workspace · ${MONTHS[month]} ${year}`}
        title="Fee"
        highlight="Collection"
        subtitle="Track which students have paid, which have pending dues, and class-wise payment status. Includes unpaid from previous months. Tuition, transport, and other fees are tracked separately per student."
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
          <DashboardSelect
            value={classFilter}
            onChange={setClassFilter}
            allowEmpty
            emptyLabel="All classes"
            placeholder="All classes"
            className={cn(dash.fieldSm, 'min-h-[38px] min-w-[140px] py-2')}
            aria-label="Filter by class"
            options={(data?.class_wise ?? []).map((c) => ({ value: c.class_name, label: c.class_name }))}
          />
          <Button
            onClick={handleGenerateFees}
            disabled={generating || !canGenerateFees}
            title={!canGenerateFees ? 'Generate fees is not allowed for past months' : undefined}
            className="rounded-xl bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-50 border-0"
          >
            {generating ? 'Generating…' : 'Generate fees'}
          </Button>
          {!canGenerateFees && (
            <span className="text-xs text-slate-500 md:max-w-xs">
              Viewing {MONTHS[month]} {year}. Generate fees only for the current month.
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setView('summary')}
              className={cn('px-4 py-2 text-sm font-medium transition', view === 'summary' ? dash.tabActive : dash.tabInactive)}
            >
              By Class
            </button>
            <button
              type="button"
              onClick={() => setView('students')}
              className={cn('px-4 py-2 text-sm font-medium transition', view === 'students' ? dash.tabActive : dash.tabInactive)}
            >
              By Student
            </button>
            <button
              type="button"
              onClick={() => setView('defaulters')}
              className={cn('px-4 py-2 text-sm font-medium transition', view === 'defaulters' ? dash.tabActive : dash.tabInactive)}
            >
              Defaulters ({defaulters.length})
            </button>
          </div>
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
          <InlineLoading message="Loading collection data…" />
        ) : !data ? (
          <p className={dash.empty}>Failed to load data.</p>
        ) : data.student_wise.length === 0 ? (
          <div className="p-12 text-center">
            <Layers className="mx-auto mb-3 h-10 w-10 text-slate-600" />
            <p className="text-sm text-slate-500">
              No fee records up to {MONTHS[month]} {year}. Click &quot;Generate fees&quot; to create fee records for all students.
            </p>
          </div>
        ) : (
          <>
            {view === 'summary' && (
              <div>
                <div className="border-b border-white/10 px-6 py-4">
                  <h2 className={dash.sectionTitle}>Class-wise payment summary</h2>
                  <p className="mt-1 text-sm text-slate-500">Open a class to drill into receipts and dues</p>
                </div>
                <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-4">
                  {(classFilter ? data.class_wise.filter((c) => c.class_name.startsWith(classFilter)) : data.class_wise).map((c, i) => (
                    <motion.div
                      key={c.class_name}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 + i * 0.04 }}
                    >
                      <Link
                        href={`/dashboard/fees/class/${encodeURIComponent(c.class_name)}?month=${month}&year=${year}`}
                        className="block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-teal-500/30 hover:bg-white/[0.06]"
                      >
                        <h3 className="font-semibold text-white">{c.class_name}</h3>
                        <p className="mt-2 text-sm text-slate-500">Total due: ₹{c.total_due.toLocaleString('en-IN')}</p>
                        <p className="text-sm text-teal-400">Collected: ₹{c.total_paid.toLocaleString('en-IN')}</p>
                        <p className={cn('text-sm font-medium', c.total_pending > 0 ? 'text-amber-400' : 'text-slate-400')}>
                          Pending: ₹{c.total_pending.toLocaleString('en-IN')}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">{c.student_count} students</p>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {view === 'students' && (
              <div>
                <div className="overflow-x-auto">
                  <table className={dash.table}>
                    <thead className={dash.thead}>
                      <tr>
                        <th className={dash.th}>Student</th>
                        <th className={dash.th}>Class</th>
                        <th className={dash.th}>Fee breakdown</th>
                        <th className={cn(dash.th, 'text-right')}>Total</th>
                        <th className={cn(dash.th, 'text-right')}>Paid</th>
                        <th className={cn(dash.th, 'text-right')}>Pending</th>
                        <th className={cn(dash.th, 'text-center')}>Status</th>
                        <th className={dash.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((s, i) => (
                        <motion.tr
                          key={s.student_id}
                          initial={{ opacity: 0, x: -6 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.05 + Math.min(i, 14) * 0.025 }}
                          className={dash.tr}
                        >
                          <td className={dash.td}>
                            <div>
                              <p className="font-medium text-slate-200">{s.student_name}</p>
                              <p className="text-xs text-slate-500">{s.parent_phone}</p>
                            </div>
                          </td>
                          <td className={dash.td}>{s.class_name}</td>
                          <td className={dash.td}>
                            <div className="space-y-2">
                              {Object.entries(
                                s.fees.reduce((acc, f) => {
                                  const key = f.month && f.year ? `${f.year}-${String(f.month).padStart(2, '0')}` : 'other';
                                  (acc[key] = acc[key] || []).push(f);
                                  return acc;
                                }, {} as Record<string, typeof s.fees>)
                              )
                                .sort(([a], [b]) => (a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b)))
                                .map(([key, monthFees]) => (
                                  <div key={key}>
                                    {key !== 'other' && (
                                      <div className="mb-1 mt-2 border-b border-white/10 pb-1 text-xs font-semibold text-slate-500 first:mt-0">
                                        {MONTHS[parseInt(key.split('-')[1])]} {key.split('-')[0]}
                                      </div>
                                    )}
                                    {monthFees.map((f) => (
                                      <div key={f.student_fee_id} className="flex flex-wrap items-center gap-2 text-sm">
                                        <span className="text-slate-400">{f.fee_type}:</span>
                                        <span className={f.balance > 0 ? 'text-amber-400' : 'text-teal-400'}>
                                          ₹{f.paid.toLocaleString('en-IN')}/{f.total.toLocaleString('en-IN')}
                                        </span>
                                        {f.paid > 0 && (
                                          <button
                                            type="button"
                                            onClick={() => setReceiptStudent(s)}
                                            className="text-xs text-teal-400 underline-offset-4 hover:text-teal-300 hover:underline"
                                          >
                                            Receipt
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                            </div>
                          </td>
                          <td className={cn(dash.td, 'text-right tabular-nums')}>₹{s.total_due.toLocaleString('en-IN')}</td>
                          <td className={cn(dash.td, 'text-right tabular-nums text-teal-400')}>₹{s.total_paid.toLocaleString('en-IN')}</td>
                          <td className={cn(dash.td, 'text-right tabular-nums font-medium', s.total_pending > 0 ? 'text-amber-400' : 'text-slate-400')}>
                            ₹{s.total_pending.toLocaleString('en-IN')}
                          </td>
                          <td className={cn(dash.td, 'text-center')}>
                            <span
                              className={cn(
                                dash.badge,
                                s.status === 'fully_paid' ? dash.badgeTeal : s.status === 'partial' ? dash.badgeAmber : dash.badgeRed
                              )}
                            >
                              {s.status === 'fully_paid' ? 'Paid' : s.status === 'partial' ? 'Partial' : 'Unpaid'}
                            </span>
                          </td>
                          <td className={dash.td}>
                            <div className="flex flex-wrap gap-2">
                              {s.fees.some((f) => f.balance > 0) && (
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
                              )}
                              {s.fees.some((f) => f.paid > 0) && (
                                <button
                                  type="button"
                                  onClick={() => setReceiptStudent(s)}
                                  className="text-sm font-medium text-slate-300 transition hover:text-teal-300"
                                >
                                  Receipt
                                </button>
                              )}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'defaulters' && (
              <div>
                <div className="border-b border-white/10 px-6 py-4">
                  <h2 className={dash.sectionTitle}>Students with pending fees ({defaulters.length})</h2>
                </div>
                {defaulters.length === 0 ? (
                  <p className="py-12 text-center text-teal-400">All payments clear!</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className={dash.table}>
                      <thead className={dash.thead}>
                        <tr>
                          <th className={dash.th}>Student</th>
                          <th className={dash.th}>Class</th>
                          <th className={dash.th}>Pending fees</th>
                          <th className={cn(dash.th, 'text-right')}>Amount due</th>
                          <th className={dash.th}>Phone</th>
                          <th className={dash.th}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaulters.map((s, i) => (
                          <motion.tr
                            key={s.student_id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.05 + Math.min(i, 14) * 0.025 }}
                            className={cn(dash.tr, 'hover:bg-red-500/[0.04]')}
                          >
                            <td className={cn(dash.td, 'font-medium text-slate-200')}>{s.student_name}</td>
                            <td className={dash.td}>{s.class_name}</td>
                            <td className={dash.td}>
                              {Object.entries(
                                s.fees.filter((f) => f.balance > 0).reduce((acc, f) => {
                                  const key = f.month && f.year ? `${f.year}-${String(f.month).padStart(2, '0')}` : 'other';
                                  (acc[key] = acc[key] || []).push(f);
                                  return acc;
                                }, {} as Record<string, typeof s.fees>)
                              )
                                .sort(([a], [b]) => (a === 'other' ? 1 : b === 'other' ? -1 : a.localeCompare(b)))
                                .map(([key, monthFees]) => (
                                  <div key={key} className="mb-2">
                                    {key !== 'other' && (
                                      <div className="mb-1 border-b border-white/10 pb-0.5 text-xs font-semibold text-slate-500">
                                        {MONTHS[parseInt(key.split('-')[1])]} {key.split('-')[0]}
                                      </div>
                                    )}
                                    {monthFees.map((f) => (
                                      <div key={f.student_fee_id} className="text-sm text-slate-400">
                                        {f.fee_type}: ₹{f.balance.toLocaleString('en-IN')} pending
                                      </div>
                                    ))}
                                  </div>
                                ))}
                            </td>
                            <td className={cn(dash.td, 'text-right font-medium text-amber-400 tabular-nums')}>
                              ₹{s.total_pending.toLocaleString('en-IN')}
                            </td>
                            <td className={dash.td}>{s.parent_phone}</td>
                            <td className={dash.td}>
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
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
        <DashboardModal
          wide
          title={`Record payment – ${payAllStudent.student_name}`}
          subtitle="Choose monthly, yearly, or all pending (includes arrears). Amount is calculated from selected fee types."
          onClose={closePayModal}
        >
          <div className={cn(dash.innerPanel, 'mb-4 border-teal-500/20 bg-teal-500/5')}>
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
          {payMode !== 'all_pending' && (
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
                  paymentPreview.monthly.breakdown.map((f, idx) => (
                    <div key={idx} className="flex justify-between gap-4">
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
                            <span className={`inline-block text-xs transition-transform ${expandedFeeType === feeType ? 'rotate-90' : ''}`}>▶</span>
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
                            {items.sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - (b.year ?? 0) * 12 - (b.month ?? 0)).map((f, idx2) => {
                              const itemHasDiscount = (f.after_discount ?? f.balance) < f.balance;
                              const itemPct =
                                f.discount_percent ?? (f.balance > 0 ? Math.round(((f.balance - (f.after_discount ?? f.balance)) / f.balance) * 100) : 0);
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
                  });
                })()
              )}
            </div>
            <div className="mt-3 space-y-1 border-t border-teal-500/20 pt-2">
              {payMode === 'all_pending' ? (
                <div className="flex justify-between font-semibold text-teal-300">
                  <span>
                    All pending (up to {MONTHS[month]} {year})
                  </span>
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
                        (paymentPreview.yearly.amount_before_discount ?? 0) > paymentPreview.yearly.amount ? 'text-sm text-slate-400' : 'font-semibold text-teal-300'
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
                <motion.div className="flex justify-between text-sm text-slate-400">
                  <span>
                    Adjustment ({adjustmentType === 'add' ? '+' : '−'}₹{parseFloat(adjustmentAmount).toLocaleString('en-IN')})
                  </span>
                  <span className={adjustmentType === 'add' ? 'text-emerald-400' : 'text-rose-400'}>
                    {adjustmentType === 'add' ? '+' : '−'}₹{parseFloat(adjustmentAmount).toLocaleString('en-IN')}
                  </span>
                </motion.div>
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
                disabled={saving || (payMode !== 'all_pending' && (previewLoading && !paymentPreview))}
                className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 border-0 disabled:opacity-50"
              >
                {saving
                  ? 'Processing...'
                  : payMode === 'all_pending' || paymentPreview
                    ? `Pay ₹${displayPayAmount.toLocaleString('en-IN')}`
                    : 'Loading...'}
              </Button>
              <Button type="button" variant="outline" onClick={closePayModal} className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10">
                Cancel
              </Button>
            </div>
          </form>
        </DashboardModal>
      )}
    </PageShell>
  );
}
