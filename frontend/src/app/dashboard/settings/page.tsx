'use client';

import { useEffect, useRef, useState } from 'react';
import { Settings, Check, Upload, Building2, User, Copy, Share2, CreditCard, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMe,
  getSchool,
  getPaymentConfig,
  updatePaymentConfig,
  updateSchool,
  upgradeSchoolPlan,
  getPlatformBillingSummary,
  createPlatformOrder,
  verifyPlatformPayment,
  type SchoolRecord,
} from '@/lib/api';
import { formatSchoolPlanLabel } from '@/lib/plan-labels';
import { openRazorpayCheckout } from '@/lib/razorpay-checkout';
import { DashboardSelect } from '@/components/dashboard/dashboard-select';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { PageLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import { API_BASE_URL } from '@/lib/env';

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
  { key: 'basic', name: 'Basic', price: '₹299/mo', students: 100, staff: 1 },
  { key: 'standard', name: 'Pro', price: '₹599/mo', students: 300, staff: 2 },
  { key: 'premium', name: 'Premium', price: '₹999/mo', students: '∞', staff: 5 },
] as const;

const PLAN_RANK: Record<string, number> = { basic: 0, standard: 1, premium: 2 };

type BillingSummary = {
  plan: string;
  next_monthly_amount: string;
  plan_period_end?: string | null;
  trial_ends_at?: string | null;
  subscription_blocked?: boolean;
  subscription_active?: boolean;
  in_trial?: boolean;
  student_count?: number;
  staff_count?: number;
  invoices?: Array<{ id: number; amount: string; status: string; billing_cycle: string; created_at: string }>;
};

const compactField = cn(dash.field, 'min-h-[36px] py-2 px-3 text-sm');
const cardHead = 'border-b border-white/10 px-4 py-2';
const cardBody = 'p-4';

type OwnerInfo = {
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
};

function resolveSchoolPayload(data: { results?: SchoolRecord[] } | SchoolRecord): SchoolRecord | null {
  const list = 'results' in data && data.results ? data.results : data;
  return Array.isArray(list) ? list[0] ?? null : (list as SchoolRecord);
}

function logoDisplayUrl(school: SchoolRecord | null): string | null {
  if (!school) return null;
  if (school.logo_url) return school.logo_url;
  if (!school.logo) return null;
  if (school.logo.startsWith('http')) return school.logo;
  const origin = API_BASE_URL.replace(/\/api\/?$/, '');
  const path = school.logo.startsWith('/') ? school.logo : `/${school.logo}`;
  return `${origin}${path}`;
}

function SectionHead({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Building2;
  title: string;
  hint?: string;
}) {
  return (
    <div className={cardHead}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { refreshUser, setUser } = useAuth();
  const [school, setSchool] = useState<SchoolRecord | null>(null);
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAcademic, setSavingAcademic] = useState(false);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [academicSaved, setAcademicSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Bihar');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startMonth, setStartMonth] = useState(4);
  const [feeStartDay, setFeeStartDay] = useState(1);
  const [codeCopied, setCodeCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [allowParentOnlinePayment, setAllowParentOnlinePayment] = useState(false);
  const [savingParentPayment, setSavingParentPayment] = useState(false);
  const [parentPaymentSaved, setParentPaymentSaved] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [routeAccountId, setRouteAccountId] = useState('');
  const [savingRoute, setSavingRoute] = useState(false);

  const parentPortalUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/parent/login` : '/parent/login';

  const parentShareMessage = school?.public_code
    ? `${school.name} parent portal\nSchool code: ${school.public_code}\nSign in: ${parentPortalUrl}\nUse your registered mobile number and password.`
    : '';

  const copySchoolCode = async () => {
    if (!school?.public_code) return;
    try {
      await navigator.clipboard.writeText(school.public_code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      alert('Could not copy school code.');
    }
  };

  const copyParentMessage = async () => {
    if (!parentShareMessage) return;
    try {
      await navigator.clipboard.writeText(parentShareMessage);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      alert('Could not copy message.');
    }
  };

  useEffect(() => {
    Promise.all([
      getSchool(),
      getMe(),
      getPaymentConfig().catch(() => null),
      getPlatformBillingSummary().catch(() => null),
    ])
      .then(([schoolRes, meRes, paymentRes, billingRes]) => {
        const s = resolveSchoolPayload(schoolRes.data);
        if (s) {
          setSchool(s);
          setName(s.name || '');
          setAddress(s.address || '');
          setCity(s.city || '');
          setState(s.state || 'Bihar');
          setPhone(s.phone || '');
          setEmail(s.email || '');
          setStartMonth(s.academic_year_start_month ?? 4);
          setFeeStartDay(s.fee_start_day ?? 1);
          setLogoPreview(logoDisplayUrl(s));
        }
        if (paymentRes?.data) {
          setAllowParentOnlinePayment(!!paymentRes.data.allow_parent_online_payment);
          setBillingCycle(paymentRes.data.platform_billing_cycle || 'monthly');
          setRouteAccountId(paymentRes.data.razorpay_route_account_id || '');
        }
        if (billingRes?.data) {
          setBillingSummary(billingRes.data);
        }
        const me = meRes.data;
        if (me) {
          setUser(me);
          setOwner({
            username: me.username || '',
            email: me.email || '',
            first_name: me.first_name || '',
            last_name: me.last_name || '',
            phone: me.phone || '',
          });
        }
      })
      .catch(() => setSchool(null))
      .finally(() => setLoading(false));
  }, [setUser]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please choose an image file (PNG, JPG, etc.).');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Logo must be under 2 MB.');
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      let payload: FormData | Record<string, unknown>;
      if (logoFile) {
        const fd = new FormData();
        fd.append('name', name.trim());
        fd.append('address', address.trim());
        fd.append('city', city.trim());
        fd.append('state', state.trim());
        fd.append('phone', phone.trim());
        fd.append('email', email.trim());
        fd.append('logo', logoFile);
        payload = fd;
      } else {
        payload = {
          name: name.trim(),
          address: address.trim(),
          city: city.trim(),
          state: state.trim(),
          phone: phone.trim(),
          email: email.trim(),
        };
      }
      const { data } = await updateSchool(school.id, payload);
      setSchool(data);
      setLogoFile(null);
      setLogoPreview(logoDisplayUrl(data));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch {
      alert('Failed to update school profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveParentPaymentSetting = async () => {
    setSavingParentPayment(true);
    setParentPaymentSaved(false);
    try {
      await updatePaymentConfig({ allow_parent_online_payment: allowParentOnlinePayment });
      setParentPaymentSaved(true);
      setTimeout(() => setParentPaymentSaved(false), 2500);
    } catch {
      alert('Failed to save parent payment setting');
    } finally {
      setSavingParentPayment(false);
    }
  };

  const handleSaveAcademic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    setSavingAcademic(true);
    setAcademicSaved(false);
    try {
      const { data } = await updateSchool(school.id, {
        academic_year_start_month: startMonth,
        fee_start_day: feeStartDay,
      });
      setSchool(data);
      setAcademicSaved(true);
      setTimeout(() => setAcademicSaved(false), 2500);
    } catch {
      alert('Failed to update academic settings');
    } finally {
      setSavingAcademic(false);
    }
  };

  const refreshBilling = async () => {
    try {
      const [{ data: bill }, { data: schoolData }] = await Promise.all([getPlatformBillingSummary(), getSchool()]);
      setBillingSummary(bill);
      const s = resolveSchoolPayload(schoolData);
      if (s) setSchool(s);
      await refreshUser();
    } catch {
      /* ignore */
    }
  };

  const currentPlan = school?.plan ?? 'standard';

  const planNeedsPayment = (current: string, target: string) => {
    if (current === target) return true;
    return (PLAN_RANK[target] ?? 0) > (PLAN_RANK[current] ?? 0);
  };

  const payForPlan = async (plan: 'basic' | 'standard' | 'premium') => {
    if (!school) return;
    setUpgradingPlan(plan);
    try {
      const { data } = await createPlatformOrder(billingCycle, plan);
      await openRazorpayCheckout(
        data.order_id,
        data.amount_paise,
        async (resp) => {
          await verifyPlatformPayment(resp);
          await refreshBilling();
          alert(`Payment successful. ${formatSchoolPlanLabel(plan)} plan is now active.`);
        },
        {
          name: 'SchoolFee Pro',
          description: `${formatSchoolPlanLabel(plan)} subscription (${billingCycle})`,
        },
      );
    } catch (err: unknown) {
      const msg = (err as Error)?.message;
      if (msg && msg !== 'Payment cancelled.') alert(msg);
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleUpgradePlan = async (plan: 'basic' | 'standard' | 'premium') => {
    if (!school) return;
    if (school.plan === plan && !school.subscription_blocked && billingSummary?.subscription_active) return;

    if (planNeedsPayment(currentPlan, plan) || school.subscription_blocked) {
      await payForPlan(plan);
      return;
    }

    setUpgradingPlan(plan);
    try {
      await upgradeSchoolPlan(school.id, plan);
      await refreshBilling();
      alert(`Plan changed to ${formatSchoolPlanLabel(plan)}.`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data;
      alert(msg?.error || msg?.detail || 'Failed to change plan');
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleSaveRouteAccount = async () => {
    setSavingRoute(true);
    try {
      await updatePaymentConfig({
        platform_billing_cycle: billingCycle,
        razorpay_route_account_id: routeAccountId.trim(),
      });
      alert('Payment settings saved.');
    } catch {
      alert('Failed to save payment settings.');
    } finally {
      setSavingRoute(false);
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

  const planLabel = formatSchoolPlanLabel(school.plan);
  const trialEnd = school.trial_ends_at ? new Date(school.trial_ends_at).toLocaleDateString('en-IN') : null;
  const periodEnd = school.plan_period_end
    ? new Date(school.plan_period_end).toLocaleDateString('en-IN')
    : billingSummary?.plan_period_end
      ? new Date(billingSummary.plan_period_end).toLocaleDateString('en-IN')
      : null;
  const registeredOn = school.created_at ? new Date(school.created_at).toLocaleDateString('en-IN') : null;
  const subscriptionBlocked = school.subscription_blocked || billingSummary?.subscription_blocked;

  return (
    <PageShell className="w-full">
      <PageHeader
        icon={Settings}
        eyebrow="Configuration"
        title="Settings"
        subtitle="School profile, academic calendar, and plan."
      />

      {school.public_code ? (
        <GlassCard delay={0.02}>
          <SectionHead icon={Share2} title="School code for parents" hint="Parent portal" />
          <div className={cardBody}>
            <p className="mb-3 text-sm text-slate-400">
              Share this code with parents so they can register and sign in to the parent portal using their mobile number.
            </p>
            <div className="rounded-xl border border-teal-500/25 bg-teal-500/10 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">School code</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-wide text-teal-200">
                {school.public_code}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                School ID: {school.id} · {school.name}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copySchoolCode}
                className="h-8 rounded-lg border-white/15 bg-white/5 text-xs text-slate-200"
              >
                {codeCopied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Code copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy code
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copyParentMessage}
                className="h-8 rounded-lg border-white/15 bg-white/5 text-xs text-slate-200"
              >
                {messageCopied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Message copied
                  </>
                ) : (
                  <>
                    <Share2 className="mr-1.5 h-3.5 w-3.5" /> Copy message for parents
                  </>
                )}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Parents open{' '}
              <a href={parentPortalUrl} target="_blank" rel="noopener noreferrer" className="text-teal-300 hover:underline">
                {parentPortalUrl}
              </a>{' '}
              and enter this school code with the mobile number registered at admission.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={allowParentOnlinePayment}
                  onChange={(e) => setAllowParentOnlinePayment(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500/30"
                />
                <span>
                  <span className="text-sm font-medium text-slate-200">Allow parents to pay fees online</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    When enabled, parents see a Pay button on unpaid months in the parent portal (Razorpay). When disabled, online payment is hidden.
                  </span>
                </span>
              </label>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={savingParentPayment}
                  onClick={handleSaveParentPaymentSetting}
                  className="h-8 rounded-lg border-0 bg-teal-600 px-4 text-xs"
                >
                  {savingParentPayment ? 'Saving…' : parentPaymentSaved ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Saved
                    </>
                  ) : (
                    'Save parent payment setting'
                  )}
                </Button>
              </div>
            </div>
          </div>
        </GlassCard>
      ) : null}

      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] xl:items-start">
        <GlassCard delay={0.03}>
          <SectionHead icon={Building2} title="School profile" hint="Receipts" />
          <form onSubmit={handleSaveProfile} className={cardBody}>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
                {logoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreview} alt="" className="h-full w-full object-contain p-1" />
                ) : (
                  <Building2 className="h-6 w-6 text-slate-600" />
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleLogoChange}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 rounded-lg border-white/15 bg-white/5 text-xs text-slate-200"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {logoPreview ? 'Change logo' : 'Upload logo'}
              </Button>
              <span className="text-xs text-slate-500">PNG/JPG, max 2 MB</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className={cn(dash.label, 'mb-1 text-xs')}>School name *</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={compactField} required />
              </div>
              <div>
                <label className={cn(dash.label, 'mb-1 text-xs')}>Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={compactField} inputMode="tel" />
              </div>
              <div>
                <label className={cn(dash.label, 'mb-1 text-xs')}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={compactField} />
              </div>
              <div>
                <label className={cn(dash.label, 'mb-1 text-xs')}>City</label>
                <input value={city} onChange={(e) => setCity(e.target.value)} className={compactField} />
              </div>
              <div>
                <label className={cn(dash.label, 'mb-1 text-xs')}>State</label>
                <input value={state} onChange={(e) => setState(e.target.value)} className={compactField} />
              </div>
              <div>
                <label className={cn(dash.label, 'mb-1 text-xs')}>Address</label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={compactField}
                  placeholder="Street, area"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <p className="text-xs text-slate-500">
                {registeredOn && <>Reg. {registeredOn}</>}
                {registeredOn && trialEnd && ' · '}
                {trialEnd && <>Trial {trialEnd}</>}
                {' · '}
                Plan <span className="text-teal-300">{planLabel}</span>
              </p>
              <Button type="submit" size="sm" disabled={savingProfile} className="h-8 rounded-lg border-0 bg-teal-600 px-4 text-xs">
                {savingProfile ? 'Saving…' : profileSaved ? (
                  <>
                    <Check className="mr-1 h-3.5 w-3.5" /> Saved
                  </>
                ) : (
                  'Save profile'
                )}
              </Button>
            </div>
          </form>
        </GlassCard>

          <div className="flex flex-col gap-4">
          {owner && (
            <GlassCard delay={0.05}>
              <SectionHead icon={User} title="Account owner" />
              <dl className={cn(cardBody, 'space-y-2.5 text-xs')}>
                <div>
                  <dt className="text-slate-500">Name</dt>
                  <dd className="font-medium text-slate-200">
                    {[owner.first_name, owner.last_name].filter(Boolean).join(' ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Username</dt>
                  <dd className="font-medium text-slate-200">{owner.username}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Email</dt>
                  <dd className="truncate text-slate-200">{owner.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Phone</dt>
                  <dd className="text-slate-200">{owner.phone || '—'}</dd>
                </div>
              </dl>
            </GlassCard>
          )}

          <GlassCard delay={0.06}>
            <SectionHead icon={Settings} title="Academic & fees" />
            <form onSubmit={handleSaveAcademic} className={cardBody}>
              <div className="space-y-3">
                <div>
                  <label className={cn(dash.label, 'mb-1 text-xs')}>Year starts</label>
                  <DashboardSelect
                    value={String(startMonth)}
                    onChange={(v) => setStartMonth(parseInt(v, 10))}
                    className={cn(dash.fieldSm, 'min-h-[36px] w-full')}
                    options={MONTHS.map((m) => ({ value: String(m.value), label: m.label }))}
                  />
                </div>
                <div>
                  <label className={cn(dash.label, 'mb-1 text-xs')}>School billing day</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={feeStartDay}
                    onChange={(e) => setFeeStartDay(Math.max(1, Math.min(28, parseInt(e.target.value || '1', 10))))}
                    className={compactField}
                    aria-describedby="school-billing-day-help"
                  />
                  <p id="school-billing-day-help" className="mt-1.5 text-xs leading-relaxed text-slate-500">
                    Day of each month (1–28) your school uses for fee cycles. When you add a student, this decides whether their join month is billed or billing starts next month.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="submit" size="sm" disabled={savingAcademic} className="h-8 rounded-lg border-0 bg-teal-600 px-4 text-xs">
                  {savingAcademic ? 'Saving…' : academicSaved ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Saved
                    </>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </form>
          </GlassCard>
          </div>
        </div>

        <GlassCard delay={0.08}>
          <SectionHead icon={CreditCard} title="Subscription" hint={`Current: ${planLabel}`} />
          <div className={cardBody}>
            {subscriptionBlocked && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Your subscription has expired. Pay online to continue, or reduce to under 100 students and 1 staff
                  login to be moved to Basic automatically.
                </p>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
              {billingSummary?.in_trial && trialEnd && <span>Trial ends {trialEnd}</span>}
              {periodEnd && !subscriptionBlocked && <span>Active until {periodEnd}</span>}
              {billingSummary && (
                <span>
                  Usage: {billingSummary.student_count ?? 0} students · {billingSummary.staff_count ?? 0} staff logins
                </span>
              )}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label className={cn(dash.label, 'text-xs')}>Billing cycle</label>
              <DashboardSelect
                value={billingCycle}
                onChange={(v) => setBillingCycle(v as 'monthly' | 'yearly')}
                className={cn(dash.fieldSm, 'min-h-[32px] w-36')}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const isCurrent = school.plan === plan.key;
              const needsPay = planNeedsPayment(currentPlan, plan.key) || !!subscriptionBlocked;
              const btnLabel = isCurrent
                ? subscriptionBlocked || !billingSummary?.subscription_active
                  ? 'Pay to renew'
                  : 'Renew'
                : needsPay
                  ? 'Pay & switch'
                  : 'Downgrade';
              return (
                <div
                  key={plan.key}
                  className={cn(
                    'rounded-lg border p-3 transition',
                    isCurrent
                      ? 'border-teal-500/40 bg-teal-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20'
                  )}
                >
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="text-sm font-semibold text-white">{plan.name}</span>
                    {isCurrent && (
                      <span className={cn(dash.badge, dash.badgeTeal, 'px-1.5 py-0 text-[10px]')}>Current</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-teal-300">{plan.price}</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {plan.students} students · {plan.staff} staff
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    disabled={upgradingPlan === plan.key || (isCurrent && !needsPay && !!billingSummary?.subscription_active && !subscriptionBlocked)}
                    onClick={() => handleUpgradePlan(plan.key)}
                    className={cn(
                      'mt-2 h-7 w-full rounded-md text-xs',
                      isCurrent && !subscriptionBlocked && billingSummary?.subscription_active
                        ? 'border-white/10 bg-white/5 text-slate-500'
                        : 'border-0 bg-teal-600'
                    )}
                    variant={isCurrent && !subscriptionBlocked && billingSummary?.subscription_active ? 'outline' : 'default'}
                  >
                    {upgradingPlan === plan.key ? 'Processing…' : isCurrent && !subscriptionBlocked && billingSummary?.subscription_active ? 'Active' : btnLabel}
                  </Button>
                </div>
              );
            })}
            </div>
            <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <p className="text-xs font-medium text-slate-300">Parent fee settlement (optional)</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Razorpay Route account ID — parent online payments settle to your school account when configured.
              </p>
              <input
                value={routeAccountId}
                onChange={(e) => setRouteAccountId(e.target.value)}
                placeholder="acc_xxxxxx"
                className={cn(compactField, 'mt-2')}
              />
              <Button
                type="button"
                size="sm"
                disabled={savingRoute}
                onClick={handleSaveRouteAccount}
                className="mt-2 h-7 rounded-md border-0 bg-teal-600 text-xs"
              >
                {savingRoute ? 'Saving…' : 'Save payment settings'}
              </Button>
            </div>
            {billingSummary?.invoices && billingSummary.invoices.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-400">Recent platform payments</p>
                <div className="space-y-1">
                  {billingSummary.invoices.slice(0, 5).map((inv) => (
                    <div key={inv.id} className="flex justify-between text-[11px] text-slate-500">
                      <span>
                        ₹{inv.amount} · {inv.billing_cycle} · {new Date(inv.created_at).toLocaleDateString('en-IN')}
                      </span>
                      <span className={inv.status === 'paid' ? 'text-teal-400' : 'text-amber-400'}>{inv.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
