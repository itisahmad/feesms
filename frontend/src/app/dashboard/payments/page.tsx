'use client';

import { useEffect, useState } from 'react';
import {
  createParentPaymentIntent,
  createPlatformOrder,
  getPaymentConfig,
  getPlatformBillingSummary,
  updatePaymentConfig,
  verifyParentPayment,
  verifyPlatformPayment,
} from '@/lib/api';

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
      theme: { color: '#0f766e' },
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

  if (loading) return <div className="p-12 text-center text-gray-500">Loading payments...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Payments</h1>

      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Platform Billing (School pays platform)</h2>
        <p className="text-sm text-gray-500">This amount is collected into your platform account.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Billing cycle</label>
            <select
              value={platformCycle}
              onChange={(e) => setPlatformCycle(e.target.value as 'monthly' | 'yearly')}
              className="w-full px-3 py-2 rounded border border-gray-200"
            >
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">School Razorpay Route Account ID</label>
            <input
              value={routeAccountId}
              onChange={(e) => setRouteAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-200"
              placeholder="acc_xxxxxx (for parent-to-school settlement)"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSaveConfig} disabled={saving} className="px-4 py-2 rounded bg-teal-600 text-white disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Payment Config'}
          </button>
          <button onClick={handlePlatformPay} className="px-4 py-2 rounded bg-amber-500 text-white">
            Pay Platform Fee
          </button>
        </div>
        {summary && (
          <div className="text-sm text-gray-600">
            Plan: <b>{summary.plan}</b> | Next monthly: <b>Rs {summary.next_monthly_amount}</b>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold">Parent Payment (goes to school)</h2>
        <p className="text-sm text-gray-500">Create a checkout for one student fee line item. Settlement uses Razorpay Route when configured.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            value={parentStudentFeeId}
            onChange={(e) => setParentStudentFeeId(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-200"
            placeholder="Student Fee ID"
          />
          <input
            value={parentAmount}
            onChange={(e) => setParentAmount(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gray-200"
            placeholder="Amount"
            type="number"
            min="0"
            step="0.01"
          />
        </div>
        <button onClick={handleParentPay} className="px-4 py-2 rounded bg-teal-600 text-white">
          Start Parent Payment
        </button>
      </div>
    </div>
  );
}
