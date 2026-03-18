'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { resetPassword } from '@/lib/api';

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const uid = useMemo(() => params.get('uid') || '', [params]);
  const token = useMemo(() => params.get('token') || '', [params]);

  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const { data } = await resetPassword({ uid, token, password, password2 });
      setMessage(data?.message || 'Password reset successful.');
      setPassword('');
      setPassword2('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string; password?: string[] } } })?.response?.data?.error
        || (err as { response?: { data?: { password?: string[] } } })?.response?.data?.password?.[0]
        || 'Failed to reset password';
      setMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!uid || !token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="bg-white border border-gray-100 rounded-xl p-6 max-w-md w-full">
          <p className="text-red-600 text-sm mb-3">Invalid reset link. Missing uid/token.</p>
          <Link href="/forgot-password" className="text-teal-600 hover:underline text-sm">Generate new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-amber-50/30 to-teal-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Reset password</h1>
        <p className="text-sm text-gray-600 mb-6">Enter your new password.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
            required
          />
          <input
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Resetting...' : 'Reset password'}
          </button>
        </form>

        {message && <p className="text-sm text-gray-700 mt-4">{message}</p>}

        <p className="mt-6 text-sm text-gray-600">
          Back to{' '}
          <Link href="/login" className="text-teal-600 hover:underline font-medium">Login</Link>
        </p>
      </div>
    </div>
  );
}
