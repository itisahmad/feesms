'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Building2, Users } from 'lucide-react';
import {
  createParentPaymentIntent,
  createPlatformOrder,
  getPaymentConfig,
  getPlatformBillingSummary,
  updatePaymentConfig,
  verifyParentPayment,
  verifyPlatformPayment,
} from '@/lib/api';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { PageLoading } from '@/components/dashboard/loading-state';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

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

export default function PaymentsPage() {
  const [platformCycle, setPlatformCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [routeAccountId, setRouteAccountId] = useState('');
  const [summary, setSummary] = useState<{ plan: string; next_monthly_amount: string; invoices: Array<{ id: number; amount: string; status: string; billing_cycle: string; created_at: string }> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [parentStudentFeeId, setParentStudentFeeId] = useState('');
  const [parentAmount, setParentAmount] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [{ data: cfg }, { data: bill }] = await Promise.all([
        getPaymentConfig(),
        getPlatformBillingSummary(),
      ]);
      setPlatformCycle(cfg.platform_billing_cycle || 'monthly');
      setRouteAccountId(cfg.razorpay_route_account_id || '');
      setSummary(bill);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCheckout = async (
    orderId: string,
    amountPaise: number,
    onSuccess: (resp: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => Promise<void>
  ) => {
    const ok = await loadRazorpayScript();
    if (!ok || !window.Razorpay) {
      alert('Failed to load Razorpay checkout.');
      return;
    }

    const key = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    if (!key) {
      alert('NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured.');
      return;
    }

    const rz = new window.Razorpay({
      key,
      amount: amountPaise,
      currency: 'INR',
      order_id: orderId,
      name: 'SchoolFee Pro',
      handler: async (response: unknown) => {
        const payload = response as {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        };
        await onSuccess(payload);
      },
      theme: { color: '#14b8a6' },
    });
    rz.open();
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await updatePaymentConfig({
        platform_billing_cycle: platformCycle,
        razorpay_route_account_id: routeAccountId.trim(),
      });
      alert('Payment config saved.');
      await loadData();
    } catch {
      alert('Failed to save payment config.');
    } finally {
      setSaving(false);
    }
  };

  const handlePlatformPay = async () => {
    try {
      const { data } = await createPlatformOrder(platformCycle);
      await openCheckout(data.order_id, data.amount_paise, async (resp) => {
        await verifyPlatformPayment(resp);
        alert('Platform payment captured.');
        await loadData();
      });
    } catch {
      alert('Failed to create platform payment order.');
    }
  };

  const handleParentPay = async () => {
    const studentFeeId = parseInt(parentStudentFeeId, 10);
    const amount = parseFloat(parentAmount);
    if (!studentFeeId || !amount || amount <= 0) {
      alert('Enter valid student fee ID and amount.');
      return;
    }
    try {
      const { data } = await createParentPaymentIntent({
        student_fee_id: studentFeeId,
        amount,
      });
      await openCheckout(data.order_id, data.amount_paise, async (resp) => {
        await verifyParentPayment({
          intent_id: data.intent.id,
          ...resp,
          payment_mode: 'Online (Razorpay)',
        });
        alert('Parent payment captured and posted to student fee.');
      });
    } catch {
      alert('Failed to create parent payment intent.');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <PageShell>
      <PageHeader
        icon={CreditCard}
        eyebrow="Razorpay integration"
        title="Payments"
        subtitle="Configure platform billing and parent-to-school fee settlements."
      />

      <GlassCard delay={0.05}>
        <div className="flex items-start gap-3 border-b border-white/10 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30">
            <Building2 className="h-5 w-5 text-violet-300" />
          </div>
          <div>
            <h2 className={dash.sectionTitle}>Platform billing</h2>
            <p className="text-sm text-slate-500">School pays platform — collected into your platform account.</p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={dash.label}>Billing cycle</label>
              <select value={platformCycle} onChange={(e) => setPlatformCycle(e.target.value as 'monthly' | 'yearly')} className={dash.field}>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div>
              <label className={dash.label}>School Razorpay Route Account ID</label>
              <input
                value={routeAccountId}
                onChange={(e) => setRouteAccountId(e.target.value)}
                className={dash.field}
                placeholder="acc_xxxxxx (for parent-to-school settlement)"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSaveConfig} disabled={saving} className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0">
              {saving ? 'Saving…' : 'Save payment config'}
            </Button>
            <Button onClick={handlePlatformPay} variant="outline" className="rounded-xl border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200">
              Pay platform fee
            </Button>
          </div>
          {summary && (
            <p className="text-sm text-slate-400">
              Plan: <span className="font-medium text-white">{summary.plan}</span>
              {' · '}
              Next monthly: <span className="font-medium text-teal-300">₹{summary.next_monthly_amount}</span>
            </p>
          )}
        </div>
      </GlassCard>

      <GlassCard delay={0.1}>
        <div className="flex items-start gap-3 border-b border-white/10 px-6 py-4">
          <motion.div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/20 ring-1 ring-teal-400/30">
            <Users className="h-5 w-5 text-teal-300" />
          </motion.div>
          <div>
            <h2 className={dash.sectionTitle}>Parent payment</h2>
            <p className="text-sm text-slate-500">Checkout for one student fee line. Settlement uses Razorpay Route when configured.</p>
          </div>
        </div>
        <div className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              value={parentStudentFeeId}
              onChange={(e) => setParentStudentFeeId(e.target.value)}
              className={dash.field}
              placeholder="Student Fee ID"
            />
            <input
              value={parentAmount}
              onChange={(e) => setParentAmount(e.target.value)}
              className={dash.field}
              placeholder="Amount"
              type="number"
              min="0"
              step="0.01"
            />
          </div>
          <Button onClick={handleParentPay} className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0">
            Start parent payment
          </Button>
        </div>
      </GlassCard>
    </PageShell>
  );
}
