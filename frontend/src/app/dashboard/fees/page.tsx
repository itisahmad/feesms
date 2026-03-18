'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCollectionSummary, getReceipt, generateFees, payAllPending, payAllYear, getPaymentPreview, getFeeStructures } from '@/lib/api';

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
  const year = currentYear;
  const [data, setData] = useState<CollectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'summary' | 'students' | 'defaulters'>('summary');
  const [classFilter, setClassFilter] = useState('');
  const [payAllStudent, setPayAllStudent] = useState<StudentSummary | null>(null);
  const [payMode, setPayMode] = useState<'monthly' | 'yearly' | 'all_pending'>('monthly');
  const [paymentPreview, setPaymentPreview] = useState<{ monthly: { amount: number; breakdown: { fee_type: string; month?: number; year?: number; balance: number }[] }; yearly: { amount: number; amount_before_discount?: number; breakdown: { fee_type: string; month?: number; year?: number; balance: number; after_discount?: number; discount_percent?: number }[] } } | null>(null);
  const [classFeeOptions, setClassFeeOptions] = useState<{ id: number; fee_type_name: string; amount: string; billing_period_display?: string; academic_year?: string }[]>([]);
  const [selectedFeeStructureIds, setSelectedFeeStructureIds] = useState<number[]>([]);
  const [expandedFeeType, setExpandedFeeType] = useState<string | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'Cash',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    if (payAllStudent) {
      setPaymentPreview(null);
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
    if (payAllStudent) {
      setPaymentPreview(null);
      getPaymentPreview(
        payAllStudent.student_id,
        month,
        year,
        payMode === 'all_pending' ? undefined : selectedFeeStructureIds,
      )
        .then(({ data }) => setPaymentPreview(data))
        .catch(() => setPaymentPreview(null));
    } else {
      setPaymentPreview(null);
      setExpandedFeeType(null);
    }
  }, [payAllStudent?.student_id, month, year, payMode, selectedFeeStructureIds]);

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
    setSaving(true);
    try {
      if (payMode === 'yearly') {
        await payAllYear({
          student_id: payAllStudent.student_id,
          month,
          year,
          payment_date: paymentForm.payment_date,
          payment_mode: paymentForm.payment_mode,
          notes: paymentForm.notes || 'Full year payment (selected fee types)',
          fee_structure_ids: selectedFeeStructureIds,
        });
      } else if (payMode === 'all_pending') {
        await payAllPending({
          student_id: payAllStudent.student_id,
          month,
          year,
          payment_date: paymentForm.payment_date,
          payment_mode: paymentForm.payment_mode,
          notes: paymentForm.notes || 'All pending payment',
          only_this_month: false,
        });
      } else {
        await payAllPending({
          student_id: payAllStudent.student_id,
          month,
          year,
          payment_date: paymentForm.payment_date,
          payment_mode: paymentForm.payment_mode,
          notes: paymentForm.notes || 'All pending payment',
          only_this_month: true,
          fee_structure_ids: selectedFeeStructureIds,
        });
      }
      setPaymentForm({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_mode: 'Cash', notes: '' });
      setPayAllStudent(null);
      setPayMode('monthly');
      setExpandedFeeType(null);
      loadData(true);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string; detail?: string } } };
      alert(axErr?.response?.data?.error || axErr?.response?.data?.detail || 'Failed to record payment');
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

  const filteredStudents = data?.student_wise.filter((s) => !classFilter || s.class_name.startsWith(classFilter)) || [];
  const defaulters = data?.defaulters.filter((s) => !classFilter || s.class_name.startsWith(classFilter)) || [];

  const canGenerateFees = month === currentMonth;
  const availableMonths = MONTHS.slice(1, currentMonth + 1).map((m, i) => ({ value: i + 1, label: m }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Fee Collection</h1>
        <p className="text-gray-600 mt-1">
          Track which students have paid, which have pending dues, and class-wise payment status. Includes unpaid from previous months. Tuition, transport, and other fees are tracked separately per student.
        </p>
      </div>

      <div className="flex gap-4 mb-6 items-center flex-wrap">
        <div className="px-4 py-2 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-sm font-medium">
          Current month ({MONTHS[currentMonth]} {currentYear})
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value, 10))}
          className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
        >
          {availableMonths.map(({ value, label }) => (
            <option key={value} value={value}>{label} {currentYear}</option>
          ))}
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
        >
          <option value="">All classes</option>
          {data?.class_wise.map((c) => (
            <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
          ))}
        </select>
        <button
          onClick={handleGenerateFees}
          disabled={generating || !canGenerateFees}
          title={!canGenerateFees ? 'Generate fees is not allowed for past months' : undefined}
          className="px-6 py-2.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
        >
          {generating ? 'Generating...' : 'Generate fees'}
        </button>
        {!canGenerateFees && (
          <span className="text-sm text-gray-500">
            Viewing {MONTHS[month]} {year}. Generate fees only for current or future months.
          </span>
        )}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => setView('summary')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'summary' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            By Class
          </button>
          <button
            onClick={() => setView('students')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'students' ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            By Student
          </button>
          <button
            onClick={() => setView('defaulters')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === 'defaulters' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}
          >
            Defaulters ({defaulters.length})
          </button>
        </div>
      </div>

      {generateSuccess && (
        <div className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800">
          {generateSuccess}
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-gray-500">Loading...</div>
      ) : !data ? (
        <div className="p-12 text-center text-gray-500">Failed to load data.</div>
      ) : data.student_wise.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center text-gray-500">
          No fee records up to {MONTHS[month]} {year}. Click &quot;Generate fees&quot; to create fee records for all students.
        </div>
      ) : (
        <>
          {view === 'summary' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-800">Class-wise payment summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {(classFilter ? data.class_wise.filter((c) => c.class_name.startsWith(classFilter)) : data.class_wise).map((c) => (
                  <Link
                    key={c.class_name}
                    href={`/dashboard/fees/class/${encodeURIComponent(c.class_name)}?month=${month}&year=${year}`}
                    className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm hover:border-teal-200 hover:shadow-md transition block"
                  >
                    <h3 className="font-semibold text-gray-800 mb-3">{c.class_name}</h3>
                    <p className="text-sm text-gray-500">Total due: ₹{c.total_due.toLocaleString('en-IN')}</p>
                    <p className="text-sm text-teal-600">Collected: ₹{c.total_paid.toLocaleString('en-IN')}</p>
                    <p className={`text-sm font-medium ${c.total_pending > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                      Pending: ₹{c.total_pending.toLocaleString('en-IN')}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{c.student_count} students</p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {view === 'students' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-4 px-6 font-medium text-gray-700">Student</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-700">Class</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-700">Fee breakdown</th>
                    <th className="text-right py-4 px-6 font-medium text-gray-700">Total</th>
                    <th className="text-right py-4 px-6 font-medium text-gray-700">Paid</th>
                    <th className="text-right py-4 px-6 font-medium text-gray-700">Pending</th>
                    <th className="text-center py-4 px-6 font-medium text-gray-700">Status</th>
                    <th className="text-left py-4 px-6 font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((s) => (
                    <tr key={s.student_id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-4 px-6">
                        <div>
                          <p className="font-medium text-gray-800">{s.student_name}</p>
                          <p className="text-xs text-gray-500">{s.parent_phone}</p>
                        </div>
                      </td>
                      <td className="py-4 px-6">{s.class_name}</td>
                      <td className="py-4 px-6">
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
                                  <div className="text-xs font-semibold text-gray-500 border-b border-gray-200 pb-1 mb-1.5 mt-2 first:mt-0">
                                    {MONTHS[parseInt(key.split('-')[1])]} {key.split('-')[0]}
                                  </div>
                                )}
                                {monthFees.map((f) => (
                                  <div key={f.student_fee_id} className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-600">{f.fee_type}:</span>
                                    <span className={f.balance > 0 ? 'text-amber-600' : 'text-teal-600'}>
                                      ₹{f.paid.toLocaleString('en-IN')}/{f.total.toLocaleString('en-IN')}
                                    </span>
                                    <button
                                      onClick={() => handlePrintReceipt(f.student_fee_id, s.student_name)}
                                      className="text-teal-600 hover:underline text-xs"
                                    >
                                      Print
                                    </button>
                                    <button
                                      onClick={() => handleDownloadReceipt(f.student_fee_id, s.student_name)}
                                      className="text-gray-500 hover:underline text-xs"
                                    >
                                      Download
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ))}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right">₹{s.total_due.toLocaleString('en-IN')}</td>
                      <td className="py-4 px-6 text-right text-teal-600">₹{s.total_paid.toLocaleString('en-IN')}</td>
                      <td className={`py-4 px-6 text-right font-medium ${s.total_pending > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
                        ₹{s.total_pending.toLocaleString('en-IN')}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          s.status === 'fully_paid' ? 'bg-teal-100 text-teal-700' :
                          s.status === 'partial' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {s.status === 'fully_paid' ? 'Paid' : s.status === 'partial' ? 'Partial' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="py-4 px-6">
                        {s.fees.some((f) => f.balance > 0) && (
                          <button
                            onClick={() => { setPayAllStudent(s); setPayMode('monthly'); }}
                            className="text-sm font-medium text-teal-600 hover:text-teal-700"
                          >
                            Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {view === 'defaulters' && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <h2 className="p-4 font-semibold text-gray-800 border-b">Students with pending fees ({defaulters.length})</h2>
              {defaulters.length === 0 ? (
                <div className="p-12 text-center text-teal-600">All payments clear!</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left py-4 px-6 font-medium text-gray-700">Student</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-700">Class</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-700">Pending fees</th>
                      <th className="text-right py-4 px-6 font-medium text-gray-700">Amount due</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-700">Phone</th>
                      <th className="text-left py-4 px-6 font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {defaulters.map((s) => (
                      <tr key={s.student_id} className="border-b border-gray-50 hover:bg-red-50/30">
                        <td className="py-4 px-6 font-medium">{s.student_name}</td>
                        <td className="py-4 px-6">{s.class_name}</td>
                        <td className="py-4 px-6">
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
                                  <div className="text-xs font-semibold text-gray-500 border-b border-gray-200 pb-0.5 mb-1">
                                    {MONTHS[parseInt(key.split('-')[1])]} {key.split('-')[0]}
                                  </div>
                                )}
                                {monthFees.map((f) => (
                                  <div key={f.student_fee_id} className="text-sm">
                                    {f.fee_type}: ₹{f.balance.toLocaleString('en-IN')} pending
                                  </div>
                                ))}
                              </div>
                            ))}
                        </td>
                        <td className="py-4 px-6 text-right font-medium text-amber-600">₹{s.total_pending.toLocaleString('en-IN')}</td>
                        <td className="py-4 px-6 text-sm">{s.parent_phone}</td>
                        <td className="py-4 px-6">
                          <button
                            onClick={() => { setPayAllStudent(s); setPayMode('monthly'); }}
                            className="text-sm font-medium text-teal-600 hover:underline"
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {payAllStudent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto my-4">
            <h2 className="text-lg font-semibold mb-4">Record payment – {payAllStudent.student_name}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Choose monthly, yearly, or all pending (includes arrears). Amount is calculated from selected fee types.
            </p>
            <div className="mb-4 flex flex-wrap gap-3 p-3 bg-teal-50 rounded-lg border border-teal-100">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'monthly'}
                  onChange={() => setPayMode('monthly')}
                  className="rounded-full border-gray-300"
                />
                <span className="text-sm font-medium text-teal-800">Monthly</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'yearly'}
                  onChange={() => setPayMode('yearly')}
                  className="rounded-full border-gray-300"
                />
                <span className="text-sm font-medium text-teal-800">Yearly</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="payMode"
                  checked={payMode === 'all_pending'}
                  onChange={() => setPayMode('all_pending')}
                  className="rounded-full border-gray-300"
                />
                <span className="text-sm font-medium text-teal-800">All pending</span>
              </label>
            </div>
            {payMode !== 'all_pending' && (
              <div className="mb-4 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Fee types for this payment</div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {classFeeOptions.map((f) => {
                    const checked = selectedFeeStructureIds.includes(f.id);
                    return (
                      <label key={f.id} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                        <span className="text-gray-700">
                          {f.fee_type_name} {f.billing_period_display ? `(${f.billing_period_display})` : ''}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedFeeStructureIds((prev) =>
                              checked ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                            )
                          }
                          className="rounded border-gray-300"
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="mb-4 p-3 bg-teal-50 rounded-lg border border-teal-100">
              <div className="text-xs font-semibold text-gray-500 uppercase mb-2">Breakup</div>
              <div className="max-h-40 overflow-y-auto space-y-1.5 text-sm">
                {payMode === 'all_pending' ? (
                  payAllStudent.fees.filter((f) => f.balance > 0).length === 0 ? (
                    <span className="text-teal-600">No pending fees</span>
                  ) : (
                    payAllStudent.fees
                      .filter((f) => f.balance > 0)
                      .sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - (b.year ?? 0) * 12 - (b.month ?? 0))
                      .map((f) => (
                        <div key={f.student_fee_id} className="flex justify-between">
                          <span className="text-gray-700">{f.fee_type} {f.month && f.year ? `(${MONTHS[f.month]} ${f.year})` : ''}</span>
                          <span className="text-amber-600 font-medium">₹{f.balance.toLocaleString('en-IN')}</span>
                        </div>
                      ))
                  )
                ) : !paymentPreview ? (
                  <span className="text-gray-500">Loading...</span>
                ) : payMode === 'monthly' ? (
                  paymentPreview.monthly.breakdown.length === 0 ? (
                    <span className="text-teal-600">No fees for {MONTHS[month]} {year}</span>
                  ) : (
                    paymentPreview.monthly.breakdown.map((f, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-gray-700">{f.fee_type} {f.month && f.year ? `(${MONTHS[f.month]} ${f.year})` : ''}</span>
                        <span className="text-amber-600 font-medium">₹{f.balance.toLocaleString('en-IN')}</span>
                      </div>
                    ))
                  )
                ) : (
                  paymentPreview.yearly.breakdown.length === 0 ? (
                    <span className="text-teal-600">No fees for full year</span>
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
                          <div key={feeType} className="border-b border-teal-100 last:border-0 pb-1 last:pb-0">
                            <button
                              type="button"
                              onClick={() => setExpandedFeeType((prev) => (prev === feeType ? null : feeType))}
                              className="w-full flex justify-between items-center text-left py-1 hover:bg-teal-100/50 rounded px-1 -mx-1"
                            >
                              <span className="font-medium text-gray-800 flex items-center gap-1">
                                <span className={`inline-block transition-transform text-xs ${expandedFeeType === feeType ? 'rotate-90' : ''}`}>▶</span>
                                {feeType}
                              </span>
                              <span className="text-right">
                                {hasDiscount ? (
                                  <>
                                    <span className="text-gray-500 line-through text-sm mr-1">₹{totalBefore.toLocaleString('en-IN')}</span>
                                    <span className="text-emerald-600 font-medium">₹{totalAfter.toLocaleString('en-IN')}</span>
                                    <span className="text-emerald-600 text-xs ml-1">({discountPct}% off)</span>
                                  </>
                                ) : (
                                  <span className="text-amber-600 font-medium">₹{totalAfter.toLocaleString('en-IN')}</span>
                                )}
                              </span>
                            </button>
                            {expandedFeeType === feeType && (
                              <div className="ml-4 mt-1 space-y-0.5 pl-2 border-l-2 border-teal-200">
                                {items.sort((a, b) => (a.year ?? 0) * 12 + (a.month ?? 0) - (b.year ?? 0) * 12 - (b.month ?? 0)).map((f, i) => {
                                  const itemHasDiscount = (f.after_discount ?? f.balance) < f.balance;
                                  const itemPct = f.discount_percent ?? (f.balance > 0 ? Math.round(((f.balance - (f.after_discount ?? f.balance)) / f.balance) * 100) : 0);
                                  return (
                                    <div key={i} className="flex justify-between text-sm text-gray-600">
                                      <span>{f.month && f.year ? `${MONTHS[f.month]} ${f.year}` : 'Other'}</span>
                                      {itemHasDiscount ? (
                                        <span>
                                          <span className="line-through text-gray-400 mr-1">₹{f.balance.toLocaleString('en-IN')}</span>
                                          <span>₹{(f.after_discount ?? f.balance).toLocaleString('en-IN')}</span>
                                          <span className="text-emerald-600 text-xs ml-1">({itemPct}% off)</span>
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
                  )
                )}
              </div>
              <div className="pt-2 mt-2 border-t border-teal-200 space-y-1">
                {payMode === 'all_pending' ? (
                  <div className="flex justify-between font-semibold text-teal-700">
                    <span>All pending (up to {MONTHS[month]} {year})</span>
                    <span>₹{payAllStudent.total_pending.toLocaleString('en-IN')}</span>
                  </div>
                ) : paymentPreview ? (
                  payMode === 'monthly' ? (
                    <div className="flex justify-between font-semibold text-teal-700">
                      <span>{MONTHS[month]} {year} only</span>
                      <span>₹{paymentPreview.monthly.amount.toLocaleString('en-IN')}</span>
                    </div>
                  ) : (
                    <>
                      <div className={`flex justify-between ${(paymentPreview.yearly.amount_before_discount ?? 0) > paymentPreview.yearly.amount ? 'text-sm text-gray-600' : 'font-semibold text-teal-700'}`}>
                        <span>Full academic year (all months)</span>
                        <span>₹{(paymentPreview.yearly.amount_before_discount ?? paymentPreview.yearly.amount).toLocaleString('en-IN')}</span>
                      </div>
                      {(paymentPreview.yearly.amount_before_discount ?? 0) > paymentPreview.yearly.amount && (
                        <div className="flex justify-between font-semibold text-teal-700">
                          <span>Discounted amount to pay</span>
                          <span>₹{paymentPreview.yearly.amount.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </>
                  )
                ) : null}
              </div>
            </div>
            <form onSubmit={handlePayAll} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                <select
                  value={paymentForm.payment_mode}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, payment_mode: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                >
                  <option>Cash</option>
                  <option>UPI</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving || (payMode !== 'all_pending' && !paymentPreview)} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
                  {saving ? 'Processing...' : payMode === 'all_pending' ? `Pay ₹${payAllStudent.total_pending.toLocaleString('en-IN')}` : paymentPreview ? (payMode === 'yearly' ? `Pay ₹${paymentPreview.yearly.amount.toLocaleString('en-IN')}` : `Pay ₹${paymentPreview.monthly.amount.toLocaleString('en-IN')}`) : 'Loading...'}
                </button>
                <button type="button" onClick={() => { setPayAllStudent(null); setPayMode('monthly'); }} className="px-4 py-2.5 text-gray-600 hover:text-gray-800">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
