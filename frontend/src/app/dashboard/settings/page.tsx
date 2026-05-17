'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, Check } from 'lucide-react';
import { getSchool, updateSchool, upgradeSchoolPlan } from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { PageLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

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
  { key: 'basic', name: 'Basic', price: '₹299/month', students: 100, staff: 1, features: 'Core fee collection' },
  { key: 'standard', name: 'Pro', price: '₹599/month', students: 300, staff: 2, features: 'All core features + reminders' },
  { key: 'premium', name: 'Premium', price: '₹999/month', students: 'Unlimited', staff: 5, features: 'Advanced and scale features' },
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

  if (loading) return <PageLoading />;
  if (!school) {
    return (
      <PageShell>
        <p className={dash.empty}>No school found.</p>
      </PageShell>
    );
  }

  const planLabel = school.plan === 'standard' ? 'Pro' : school.plan === 'basic' ? 'Basic' : 'Premium';

  return (
    <PageShell>
      <PageHeader
        icon={Settings}
        eyebrow="School configuration"
        title="Settings"
        subtitle={`Manage academic calendar, fee rules, and subscription for ${school.name}.`}
      />

      <GlassCard delay={0.05} className="max-w-xl">
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Academic year</h2>
          <p className="mt-1 text-sm text-slate-500">
            Set when your school&apos;s academic year starts. This affects academic year options in Fee Structure.
          </p>
        </div>
        <form onSubmit={handleSave} className="space-y-4 p-6">
          <div>
            <label className={dash.label}>Academic year starts in</label>
            <select value={startMonth} onChange={(e) => setStartMonth(parseInt(e.target.value))} className={dash.field}>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={dash.label}>Fee start day (1-28)</label>
            <input
              type="number"
              min={1}
              max={28}
              value={feeStartDay}
              onChange={(e) => setFeeStartDay(Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10))))}
              className={dash.field}
            />
            <p className="mt-2 text-xs text-slate-500">
              Example: if set to 1, joining on or before the start day can charge the current month. Joining on 28-Apr defaults charges from 1-May.
            </p>
          </div>
          <Button type="submit" disabled={saving} className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </GlassCard>

      <GlassCard delay={0.1}>
        <div className="border-b border-white/10 px-6 py-4">
          <h2 className={dash.sectionTitle}>Subscription plans</h2>
          <p className="mt-1 text-sm text-slate-500">
            Current plan: <span className="font-medium text-teal-300">{planLabel}</span>
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
          {PLANS.map((plan, i) => {
            const isCurrent = school.plan === plan.key;
            return (
              <motion.div
                key={plan.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                className={cn(
                  'rounded-2xl border p-5 transition',
                  isCurrent
                    ? 'border-teal-500/40 bg-gradient-to-br from-teal-500/15 to-cyan-500/5 shadow-[0_0_30px_rgba(45,212,191,0.12)]'
                    : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-white">{plan.name}</h3>
                  {isCurrent && (
                    <span className={cn(dash.badge, dash.badgeTeal, 'inline-flex items-center gap-1')}>
                      <Check className="h-3 w-3" />
                      Current
                    </span>
                  )}
                </div>
                <p className="text-lg font-bold text-teal-300">{plan.price}</p>
                <p className="mt-3 text-xs text-slate-500">Students: {plan.students}</p>
                <p className="text-xs text-slate-500">Staff logins: {plan.staff}</p>
                <p className="mt-2 text-xs text-slate-400">{plan.features}</p>
                <Button
                  type="button"
                  disabled={isCurrent || upgradingPlan === plan.key}
                  onClick={() => handleUpgradePlan(plan.key)}
                  variant={isCurrent ? 'outline' : 'default'}
                  className={cn(
                    'mt-4 w-full rounded-xl',
                    isCurrent
                      ? 'border-white/10 bg-white/5 text-slate-500'
                      : 'bg-gradient-to-r from-teal-500 to-cyan-500 border-0'
                  )}
                >
                  {isCurrent ? 'Current plan' : upgradingPlan === plan.key ? 'Updating…' : `Switch to ${plan.name}`}
                </Button>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>
    </PageShell>
  );
}
