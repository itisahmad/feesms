'use client';

import { useEffect, useState } from 'react';
import { getSchool, updateSchool } from '@/lib/api';

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
];

export default function SettingsPage() {
  const [school, setSchool] = useState<{ id: number; name: string; academic_year_start_month: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startMonth, setStartMonth] = useState(4);

  useEffect(() => {
    getSchool()
      .then(({ data }) => {
        const list = data.results || data;
        const s = Array.isArray(list) ? list[0] : list;
        if (s) {
          setSchool(s);
          setStartMonth(s.academic_year_start_month ?? 4);
        }
      })
      .catch(() => setSchool(null))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    setSaving(true);
    try {
      await updateSchool(school.id, { academic_year_start_month: startMonth });
      setSchool((prev) => prev ? { ...prev, academic_year_start_month: startMonth } : null);
    } catch {
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-gray-500">Loading...</div>;
  }
  if (!school) {
    return <div className="p-12 text-center text-gray-500">No school found.</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-8">Settings</h1>
      <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-xl shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Academic year</h2>
        <p className="text-sm text-gray-500 mb-4">
          Set when your school&apos;s academic year starts. This affects academic year options in Fee Structure. (e.g. April for Indian schools, January for calendar year.)
        </p>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Academic year starts in</label>
            <select
              value={startMonth}
              onChange={(e) => setStartMonth(parseInt(e.target.value))}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
            >
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
