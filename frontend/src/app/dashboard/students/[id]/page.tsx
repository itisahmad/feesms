'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  CalendarDays,
  Hash,
  IdCard,
  IndianRupee,
  Layers,
  Receipt,
  UserCircle,
} from 'lucide-react';
import { getStudentFeeHistory, getReceipt, getFeeStructures, updateStudent } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading, PageLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface FeeStructureItem {
  id: number;
  fee_type_name: string;
  amount: string;
}

export default function StudentDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const [data, setData] = useState<{
    student: {
      id: number;
      name: string;
      class_name: string;
      school_class: number | null;
      section: number | null;
      admission_date: string | null;
      charges_effective_from?: string | null;
      admission_number?: string;
      roll_number?: string;
      parent_phone: string;
    };
    admission_date: string | null;
    months_with_fees: number;
    fee_choices: { fee_structure_id: number; fee_type: string; amount: number; effective_from: string | null }[];
    yearly_payments?: { fee_type: string; total: number; date: string; mode: string }[];
    monthly_history: { year: number; month: number; fees: { id: number; fee_type: string; total: number; paid: number; balance: number; payments: { amount: number; date: string; mode: string; is_yearly?: boolean }[] }[]; total_due: number; total_paid: number }[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFees, setEditingFees] = useState(false);
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>([]);
  const [editChoices, setEditChoices] = useState<{ fee_structure_id: number; effective_from: string }[]>([]);
  const [savingFees, setSavingFees] = useState(false);

  useEffect(() => {
    getStudentFeeHistory(id)
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (editingFees && data?.student?.school_class) {
      getFeeStructures(data.student.school_class)
        .then(({ data: fsData }) => {
          const list = fsData.results || fsData;
          setFeeStructures(list);
          setEditChoices(
            (data.fee_choices || []).map((c) => ({
              fee_structure_id: c.fee_structure_id,
              effective_from: c.effective_from?.slice(0, 10) || '',
            }))
          );
        })
        .catch(() => setFeeStructures([]));
    }
  }, [editingFees, data?.student?.school_class]);

  const toggleEditChoice = (fsId: number, effectiveFrom: string) => {
    setEditChoices((prev) => {
      const exists = prev.some((c) => c.fee_structure_id === fsId);
      if (exists) {
        return prev.filter((c) => c.fee_structure_id !== fsId);
      }
      return [...prev, { fee_structure_id: fsId, effective_from: effectiveFrom }];
    });
  };

  const setEditEffectiveFrom = (fsId: number, date: string) => {
    setEditChoices((prev) =>
      prev.map((c) => (c.fee_structure_id === fsId ? { ...c, effective_from: date } : c))
    );
  };

  const handleSaveFeeChoices = async () => {
    if (!data?.student?.school_class) return;
    setSavingFees(true);
    try {
      await updateStudent(id, {
        fee_structure_choices: editChoices.map((c) => ({
          fee_structure_id: c.fee_structure_id,
          ...(c.effective_from && { effective_from: c.effective_from }),
        })),
      });
      const { data: newData } = await getStudentFeeHistory(id);
      setData(newData);
      setEditingFees(false);
    } catch {
      alert('Failed to update fee choices');
    } finally {
      setSavingFees(false);
    }
  };

  const handlePrintReceipt = async (studentFeeId: number) => {
    try {
      const { data } = await getReceipt(studentFeeId);
      const blob = new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'width=800,height=600');
      if (win) {
        win.onload = () => win.print();
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'receipt.pdf';
        a.click();
      }
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to load receipt');
    }
  };

  if (loading) {
    return <PageLoading />;
  }
  if (!data) {
    return (
      <PageShell>
        <GlassCard>
          <p className={cn(dash.error, 'm-6')}>
            Student not found.{' '}
            <Link href="/dashboard/students" className={dash.link}>
              Back to students
            </Link>
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  const { student, admission_date, months_with_fees, fee_choices, yearly_payments = [], monthly_history } = data;
  const chargesEffectiveFrom = student?.charges_effective_from || null;
  const totalPending = monthly_history.reduce((sum, m) => {
    return sum + m.fees.reduce((s, f) => s + f.balance, 0);
  }, 0);

  const statBlocks = [
    {
      label: 'Admission date',
      value: admission_date || 'Not set',
      icon: CalendarDays,
    },
    {
      label: 'Admission number',
      value: student.admission_number || 'Auto-generated on save',
      icon: IdCard,
    },
    {
      label: 'Roll number',
      value: student.roll_number || 'Auto-generated',
      hint: 'Unique in this class and section',
      icon: Hash,
    },
    {
      label: 'Charges apply from',
      value: chargesEffectiveFrom || admission_date || 'Not set',
      hint: 'Monthly fees charged from this date',
      icon: Layers,
    },
    {
      label: 'Months with fees',
      value: String(months_with_fees),
      icon: CalendarDays,
    },
    {
      label: 'Total pending',
      value: `₹${totalPending.toLocaleString('en-IN')}`,
      valueClass: totalPending > 0 ? 'text-amber-300' : 'text-teal-300',
      icon: IndianRupee,
    },
  ];

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <Link
            href="/dashboard/students"
            className={cn(dash.link, 'mb-4 inline-flex items-center gap-1.5')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to students
          </Link>
        </div>

        <PageHeader
          icon={UserCircle}
          eyebrow="Student profile"
          title={student.name}
          subtitle={`${student.class_name} · ${student.parent_phone}`}
        />
      </div>

      <GlassCard delay={0.05}>
        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
          {statBlocks.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.04, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={cn(dash.innerPanel, 'flex gap-4')}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-500/20 bg-teal-500/10 text-teal-300">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-500">{s.label}</p>
                <p className={cn('font-semibold text-white', 'valueClass' in s ? s.valueClass : undefined)}>
                  {s.value}
                </p>
                {'hint' in s && s.hint ? (
                  <p className="mt-1 text-xs text-slate-500">{s.hint}</p>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      <GlassCard delay={0.1}>
        <div className="flex flex-col gap-4 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={dash.sectionTitle}>Fee types applied</h2>
          {!editingFees ? (
            student.school_class ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingFees(true)}
                className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              >
                Edit (add/remove fee types, set start date)
              </Button>
            ) : null
          ) : null}
        </div>
        <div className="p-6">
          {!editingFees ? (
            fee_choices.length === 0 ? (
              <p className="text-sm text-slate-500">
                No fee structure choices. Click Edit to add fee types (tuition, transport, library, exam,
                etc.).
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {fee_choices.map((fc, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05 + i * 0.03 }}
                    className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2"
                  >
                    <span className="font-medium text-slate-200">{fc.fee_type}</span>
                    <span className="text-slate-400"> — ₹{fc.amount.toLocaleString('en-IN')}</span>
                    {fc.effective_from && (
                      <span className="ml-2 text-xs text-slate-500">(from {fc.effective_from})</span>
                    )}
                  </motion.div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </GlassCard>

      <GlassCard delay={0.12}>
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Fee &amp; payment history</h2>
        </div>
        {yearly_payments.length > 0 && (
          <div className="border-b border-white/10 bg-teal-500/10 px-6 py-5">
            <h3 className="mb-3 font-medium text-slate-200">Yearly payments</h3>
            <div className="space-y-2">
              {yearly_payments.map((yp, i) => (
                <div key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium text-slate-300">{yp.fee_type} – Yearly payment</span>
                  <span className="font-semibold text-teal-300">
                    ₹{yp.total.toLocaleString('en-IN')} on {yp.date} ({yp.mode})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {monthly_history.length === 0 ? (
          <div className={dash.empty}>No fee records yet. Generate fees from Fee Collection.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {monthly_history.map((m, mi) => (
              <motion.div
                key={`${m.year}-${m.month}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.06 + mi * 0.03 }}
                className="p-6"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium text-slate-200">
                    {MONTHS[m.month]} {m.year}
                  </h3>
                  <span className="text-sm text-slate-400">
                    Due: ₹{m.total_due.toLocaleString('en-IN')} · Paid: ₹
                    {m.total_paid.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="space-y-2">
                  {m.fees.map((f) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 py-2 last:border-0"
                    >
                      <div>
                        <span className="font-medium text-slate-200">{f.fee_type}</span>
                        <span className="ml-2 text-sm text-slate-500">
                          ₹{f.paid.toLocaleString('en-IN')}/{f.total.toLocaleString('en-IN')}
                        </span>
                        {f.balance > 0 && (
                          <span className="ml-2 text-sm text-amber-400">
                            ₹{f.balance.toLocaleString('en-IN')} pending
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePrintReceipt(f.id)}
                        className={cn(dash.link, 'inline-flex items-center gap-1')}
                      >
                        <Receipt className="h-3.5 w-3.5" />
                        Print receipt
                      </button>
                    </div>
                  ))}
                </div>
                {m.fees.some((f) => f.payments.length > 0) && (
                  <div className="mt-3 rounded-xl border border-teal-500/20 bg-teal-500/10 px-4 py-3 text-sm font-medium text-teal-200">
                    {(() => {
                      const allPayments = m.fees.flatMap((f) => f.payments);
                      const yearly = allPayments.filter((p) => p.is_yearly);
                      const other = allPayments.filter((p) => !p.is_yearly);
                      const parts: string[] = [];
                      if (yearly.length > 0) parts.push('Yearly payment (see above)');
                      if (other.length > 0)
                        parts.push(other.map((p) => `₹${p.amount} on ${p.date} (${p.mode})`).join(', '));
                      return <>Payments: {parts.join(' · ')}</>;
                    })()}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </GlassCard>

      {editingFees && (
        <DashboardModal
          title="Edit fee types"
          subtitle='Tick fee types to charge. Use "Start from" when a fee begins mid-session.'
          wide
          onClose={() => setEditingFees(false)}
        >
          {feeStructures.length === 0 ? (
            <InlineLoading message="Loading fee structures…" />
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {feeStructures.map((fs) => {
                  const isSelected = editChoices.some((c) => c.fee_structure_id === fs.id);
                  const effectiveFrom =
                    editChoices.find((c) => c.fee_structure_id === fs.id)?.effective_from || '';
                  return (
                    <div key={fs.id} className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEditChoice(fs.id, '')}
                          className="rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500/30"
                        />
                        <span className="text-sm text-slate-300">
                          {fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')}
                        </span>
                      </label>
                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Start from:</span>
                          <input
                            type="date"
                            value={effectiveFrom}
                            onChange={(e) => setEditEffectiveFrom(fs.id, e.target.value)}
                            className={dash.fieldSm}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleSaveFeeChoices}
                  disabled={savingFees || editChoices.length === 0}
                  className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
                >
                  {savingFees ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingFees(false)}
                  className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DashboardModal>
      )}
    </PageShell>
  );
}
