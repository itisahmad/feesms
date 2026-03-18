'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getDashboard, sendReminder } from '@/lib/api';

interface ClassSummary {
  class_name: string;
  total_due: number;
  total_paid: number;
  total_pending: number;
  student_count: number;
}

interface Defaulter {
  student_id: number;
  student_name: string;
  class_name: string;
  pending: number;
}

interface DashboardData {
  total_due: number;
  total_collected: number;
  total_pending: number;
  students_count: number;
  unpaid_count: number;
  collection_rate?: number;
  class_wise?: ClassSummary[];
  top_defaulters?: Defaulter[];
  current_month: number;
  current_year: number;
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState(false);

  useEffect(() => {
    getDashboard()
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const handleReminder = async () => {
    setReminding(true);
    try {
      const { data } = await sendReminder('both');
      alert(data?.message || 'Reminders sent');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg || 'Failed to send reminder');
    } finally {
      setReminding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const monthName = data ? MONTHS[data.current_month] : '';
  const year = data?.current_year || new Date().getFullYear();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Total Collected</p>
          <p className="text-2xl font-bold text-teal-600">
            ₹{data?.total_collected?.toLocaleString('en-IN') ?? '0'}
          </p>
          <p className="text-xs text-gray-400 mt-1">of ₹{(data?.total_due ?? 0).toLocaleString('en-IN')} due · Up to {monthName} {year}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Pending</p>
          <p className="text-2xl font-bold text-amber-600">
            ₹{data?.total_pending?.toLocaleString('en-IN') ?? '0'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{data?.unpaid_count ?? 0} fee records</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Collection Rate</p>
          <p className="text-2xl font-bold text-teal-600">
            {data?.collection_rate ?? 0}%
          </p>
          <p className="text-xs text-gray-400 mt-1">Up to {monthName} {year}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <p className="text-sm text-gray-500 mb-1">Students</p>
          <p className="text-2xl font-bold text-gray-700">
            {data?.students_count ?? 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">Active</p>
        </div>
      </div>

      {(data?.class_wise?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Class-wise summary</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Class</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Due</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Collected</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Pending</th>
                  <th className="text-right py-3 px-4 font-medium text-gray-600">Students</th>
                  <th className="text-left py-3 px-4"></th>
                </tr>
              </thead>
              <tbody>
                {(data?.class_wise || []).map((c) => (
                  <tr key={c.class_name} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-3 px-4 font-medium text-gray-800">{c.class_name}</td>
                    <td className="py-3 px-4 text-right">₹{c.total_due.toLocaleString('en-IN')}</td>
                    <td className="py-3 px-4 text-right text-teal-600">₹{c.total_paid.toLocaleString('en-IN')}</td>
                    <td className={`py-3 px-4 text-right font-medium ${c.total_pending > 0 ? 'text-amber-600' : 'text-gray-500'}`}>
                      ₹{c.total_pending.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-4 text-right text-gray-600">{c.student_count}</td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/dashboard/fees/class/${encodeURIComponent(c.class_name)}`}
                        className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                      >
                        Collect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(data?.top_defaulters?.length ?? 0) > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Top defaulters</h2>
          <p className="text-sm text-gray-500 mb-4">Students with highest pending amount (up to {monthName} {year})</p>
          <div className="space-y-2">
            {(data?.top_defaulters || []).map((d) => (
              <Link
                key={d.student_id}
                href={`/dashboard/students/${d.student_id}`}
                className="flex justify-between items-center py-2 px-3 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-100"
              >
                <div>
                  <span className="font-medium text-gray-800">{d.student_name}</span>
                  <span className="text-gray-500 text-sm ml-2">({d.class_name})</span>
                </div>
                <span className="font-medium text-amber-600">₹{d.pending.toLocaleString('en-IN')}</span>
              </Link>
            ))}
          </div>
          <Link
            href="/dashboard/fees"
            className="inline-block mt-4 text-teal-600 hover:text-teal-700 text-sm font-medium"
          >
            Fee Collection →
          </Link>
        </div>
      )}

      <div className="flex gap-4">
        <Link
          href="/dashboard/fees"
          className="px-6 py-3 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 transition"
        >
          Collect Fees
        </Link>
        <button
          onClick={handleReminder}
          disabled={reminding || (data?.unpaid_count ?? 0) === 0}
          className="px-6 py-3 rounded-lg border border-teal-600 text-teal-600 font-medium hover:bg-teal-50 transition disabled:opacity-50"
        >
          {reminding ? 'Sending...' : 'Send WhatsApp + SMS Reminder'}
        </button>
        <Link
          href="/dashboard/students"
          className="px-6 py-3 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition"
        >
          Add Student
        </Link>
      </div>
    </div>
  );
}
