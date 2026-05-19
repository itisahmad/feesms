'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Wallet, Layers, CalendarDays } from 'lucide-react';
import { getCollectionSummary, generateFees, getSchool } from '@/lib/api';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading } from '@/components/dashboard/loading-state';
import { RecordPaymentModal } from '@/components/dashboard/record-payment-modal';
import { ReceiptPrintModal } from '@/components/dashboard/receipt-print-modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

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
                                  onClick={() => setPayAllStudent(s)}
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
                                onClick={() => setPayAllStudent(s)}
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
        <RecordPaymentModal
          student={payAllStudent}
          month={month}
          year={year}
          onClose={() => setPayAllStudent(null)}
          onPaid={() => loadData(true)}
        />
      )}
    </PageShell>
  );
}
