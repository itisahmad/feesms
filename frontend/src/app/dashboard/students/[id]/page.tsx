'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getStudentFeeHistory, getReceipt, getFeeStructures, updateStudent } from '@/lib/api';

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
    return <div className="p-12 text-center">Loading...</div>;
  }
  if (!data) {
    return (
      <div className="p-12 text-center text-red-600">
        Student not found. <Link href="/dashboard/students" className="underline">Back to students</Link>
      </div>
    );
  }

  const { student, admission_date, months_with_fees, fee_choices, yearly_payments = [], monthly_history } = data;
  const chargesEffectiveFrom = student?.charges_effective_from || null;
  const totalPending = monthly_history.reduce((sum, m) => {
    return sum + m.fees.reduce((s, f) => s + f.balance, 0);
  }, 0);

  return (
    <div>
      <div className="mb-8">
        <Link href="/dashboard/students" className="text-teal-600 hover:underline text-sm mb-4 inline-block">
          ← Back to students
        </Link>
        <h1 className="text-2xl font-bold text-gray-800">{student.name}</h1>
        <p className="text-gray-600">{student.class_name} • {student.parent_phone}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm text-gray-500">Admission date</p>
          <p className="font-semibold text-gray-800">{admission_date || 'Not set'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm text-gray-500">Admission number</p>
          <p className="font-semibold text-gray-800">{student.admission_number || 'Auto-generated on save'}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm text-gray-500">Roll number</p>
          <p className="font-semibold text-gray-800">{student.roll_number || 'Auto-generated'}</p>
          <p className="text-xs text-gray-500 mt-1">Unique in this class and section</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm text-gray-500">Charges apply from</p>
          <p className="font-semibold text-gray-800">{chargesEffectiveFrom || admission_date || 'Not set'}</p>
          <p className="text-xs text-gray-500 mt-1">Monthly fees charged from this date</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm text-gray-500">Months with fees</p>
          <p className="font-semibold text-gray-800">{months_with_fees}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total pending</p>
          <p className={`font-semibold ${totalPending > 0 ? 'text-amber-600' : 'text-teal-600'}`}>
            ₹{totalPending.toLocaleString('en-IN')}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 mb-8 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Fee types applied</h2>
          {!editingFees ? (
            student.school_class && (
              <button
                onClick={() => setEditingFees(true)}
                className="text-sm text-teal-600 hover:underline"
              >
                Edit (add/remove fee types, set start date)
              </button>
            )
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleSaveFeeChoices}
                disabled={savingFees || editChoices.length === 0}
                className="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium disabled:opacity-50"
              >
                {savingFees ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingFees(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {!editingFees ? (
          fee_choices.length === 0 ? (
            <p className="text-gray-500">No fee structure choices. Click Edit to add fee types (tuition, transport, library, exam, etc.).</p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {fee_choices.map((fc, i) => (
                <div key={i} className="px-4 py-2 bg-gray-100 rounded-lg">
                  <span className="font-medium">{fc.fee_type}</span> - ₹{fc.amount.toLocaleString('en-IN')}
                  {fc.effective_from && <span className="text-xs text-gray-500 ml-2">(from {fc.effective_from})</span>}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">Tick fee types to charge. Use &quot;Start from&quot; when a fee (library, exam, transport, etc.) begins mid-session.</p>
            {feeStructures.map((fs) => {
              const isSelected = editChoices.some((c) => c.fee_structure_id === fs.id);
              const effectiveFrom = editChoices.find((c) => c.fee_structure_id === fs.id)?.effective_from || '';
              return (
                <div key={fs.id} className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleEditChoice(fs.id, '')}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">{fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')}</span>
                  </label>
                  {isSelected && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Start from:</span>
                      <input
                        type="date"
                        value={effectiveFrom}
                        onChange={(e) => setEditEffectiveFrom(fs.id, e.target.value)}
                        className="text-sm px-2 py-1 rounded border border-gray-200"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <h2 className="text-lg font-semibold p-6 border-b">Fee & payment history</h2>
        {yearly_payments.length > 0 && (
          <div className="p-6 border-b border-gray-100 bg-teal-50/50">
            <h3 className="font-medium text-gray-800 mb-3">Yearly payments</h3>
            <div className="space-y-2">
              {yearly_payments.map((yp, i) => (
                <div key={i} className="flex justify-between items-center py-2">
                  <span className="font-medium">{yp.fee_type} – Yearly payment</span>
                  <span className="text-teal-700 font-semibold">₹{yp.total.toLocaleString('en-IN')} on {yp.date} ({yp.mode})</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {monthly_history.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No fee records yet. Generate fees from Fee Collection.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {monthly_history.map((m) => (
              <div key={`${m.year}-${m.month}`} className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium text-gray-800">{MONTHS[m.month]} {m.year}</h3>
                  <span className="text-sm">
                    Due: ₹{m.total_due.toLocaleString('en-IN')} • Paid: ₹{m.total_paid.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="space-y-2">
                  {m.fees.map((f) => (
                    <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <span className="font-medium">{f.fee_type}</span>
                        <span className="text-sm text-gray-500 ml-2">
                          ₹{f.paid.toLocaleString('en-IN')}/{f.total.toLocaleString('en-IN')}
                        </span>
                        {f.balance > 0 && (
                          <span className="ml-2 text-amber-600 text-sm">₹{f.balance.toLocaleString('en-IN')} pending</span>
                        )}
                      </div>
                      <button
                        onClick={() => handlePrintReceipt(f.id)}
                        className="text-sm text-teal-600 hover:underline"
                      >
                        Print receipt
                      </button>
                    </div>
                  ))}
                </div>
                {m.fees.some((f) => f.payments.length > 0) && (
                  <div className="mt-3 px-4 py-3 rounded-lg bg-teal-50 border border-teal-100 text-sm text-teal-800 font-medium">
                    {(() => {
                      const allPayments = m.fees.flatMap((f) => f.payments);
                      const yearly = allPayments.filter((p) => p.is_yearly);
                      const other = allPayments.filter((p) => !p.is_yearly);
                      const parts: string[] = [];
                      if (yearly.length > 0) parts.push('Yearly payment (see above)');
                      if (other.length > 0) parts.push(other.map((p) => `₹${p.amount} on ${p.date} (${p.mode})`).join(', '));
                      return <>Payments: {parts.join(' • ')}</>;
                    })()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
