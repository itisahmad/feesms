'use client';

import { useEffect, useState } from 'react';
import { getSchool, updateSchool, upgradeSchoolPlan } from '@/lib/api';

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

const PLANS = [
  { key: 'basic', name: 'Basic', price: 'Rs 299/month', students: 100, staff: 1, features: 'Core fee collection' },
  { key: 'standard', name: 'Pro', price: 'Rs 599/month', students: 300, staff: 2, features: 'All core features + reminders' },
  { key: 'premium', name: 'Premium', price: 'Rs 999/month', students: 'Unlimited', staff: 5, features: 'Advanced and scale features' },
] as const;

export default function SettingsPage() {
  const [school, setSchool] = useState<{ id: number; name: string; academic_year_start_month: number; fee_start_day?: number; plan?: string; max_students?: number; max_staff_logins?: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [startMonth, setStartMonth] = useState(4);
  const [feeStartDay, setFeeStartDay] = useState(1);

  useEffect(() => {
    getSchool()
      .then(({ data }) => {
        const list = data.results || data;
        const s = Array.isArray(list) ? list[0] : list;
        if (s) {
          setSchool(s);
          setStartMonth(s.academic_year_start_month ?? 4);
          setFeeStartDay(s.fee_start_day ?? 1);
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
      await updateSchool(school.id, { academic_year_start_month: startMonth, fee_start_day: feeStartDay });
      setSchool((prev) => prev ? { ...prev, academic_year_start_month: startMonth, fee_start_day: feeStartDay } : null);
    } catch {
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleUpgradePlan = async (plan: 'basic' | 'standard' | 'premium') => {
    if (!school) return;
    if (school.plan === plan) return;
    setUpgradingPlan(plan);
    try {
      await upgradeSchoolPlan(school.id, plan);
      const { data } = await getSchool();
      const list = data.results || data;
      const s = Array.isArray(list) ? list[0] : list;
      if (s) setSchool(s);
      alert(`Plan changed to ${plan === 'standard' ? 'Pro' : plan === 'basic' ? 'Basic' : 'Premium'}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data;
      alert(msg?.error || msg?.detail || 'Failed to change plan');
    } finally {
      setUpgradingPlan(null);
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fee start day (1-28)</label>
            <input
              type="number"
              min={1}
              max={28}
              value={feeStartDay}
              onChange={(e) => setFeeStartDay(Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10))))}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Example: if this is set to 1, then joining on 1st (or before start day) can charge current month. Joining on 28-Apr will default charges from 1-May, so April is not charged unless you change it manually.
            </p>
          </div>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-6 max-w-4xl shadow-sm mt-6">
        <h2 className="text-lg font-semibold mb-2">Subscription plans</h2>
        <p className="text-sm text-gray-500 mb-4">Current plan for {school.name}: <span className="font-medium text-teal-700">{school.plan === 'standard' ? 'Pro' : school.plan === 'basic' ? 'Basic' : 'Premium'}</span></p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map((plan) => {
            const isCurrent = school.plan === plan.key;
            return (
              <div key={plan.key} className={`rounded-lg border p-4 ${isCurrent ? 'border-teal-300 bg-teal-50' : 'border-gray-200 bg-white'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-800">{plan.name}</h3>
                  {isCurrent && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-600 text-white">Current</span>}
                </div>
                <p className="text-sm text-gray-700">{plan.price}</p>
                <p className="text-xs text-gray-500 mt-2">Students: {plan.students}</p>
                <p className="text-xs text-gray-500">Staff logins: {plan.staff}</p>
                <p className="text-xs text-gray-500 mt-2">{plan.features}</p>
                <button
                  type="button"
                  disabled={isCurrent || upgradingPlan === plan.key}
                  onClick={() => handleUpgradePlan(plan.key)}
                  className={`mt-3 w-full px-3 py-2 rounded text-sm font-medium ${
                    isCurrent ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {isCurrent ? 'Current Plan' : upgradingPlan === plan.key ? 'Updating...' : `Switch to ${plan.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
