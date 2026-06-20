'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ParentAuthShell } from '@/components/parent/parent-auth-shell';
import { VantaBackground } from '@/components/auth/vanta-background';

const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25';

export default function ParentLoginPage() {
  const [schoolCode, setSchoolCode] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { parentLogin, user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && user?.role === 'parent') {
      window.location.href = '/parent';
    }
  }, [user, authLoading]);

  if (authLoading || user?.role === 'parent') {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <VantaBackground effect="net" />
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await parentLogin(schoolCode.trim(), phone.trim(), password);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Invalid school code, phone, or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ParentAuthShell>
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Parent sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
        )}
        <div>
          <label htmlFor="schoolCode" className={labelClass}>
            School code
          </label>
          <input
            id="schoolCode"
            value={schoolCode}
            onChange={(e) => setSchoolCode(e.target.value)}
            className={inputClass}
            placeholder="From school (e.g. DPSSCHOOL-1)"
            required
          />
        </div>
        <div>
          <label htmlFor="phone" className={labelClass}>
            Mobile number
          </label>
          <input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="10-digit number on student record"
            inputMode="numeric"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className={labelClass}>
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            required
          />
          <p className="mt-2 text-right text-sm">
            <Link href="/parent/forgot-password" className="font-medium text-teal-600 hover:underline">
              Forgot password?
            </Link>
          </p>
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-600 py-3 font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        First time here?{' '}
        <Link href="/parent/register" className="font-medium text-teal-600 hover:underline">
          Register with OTP
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-gray-600">
        School staff?{' '}
        <Link href="/login/staff" className="font-medium text-teal-600 hover:underline">
          Sign in as school staff
        </Link>
      </p>
    </ParentAuthShell>
  );
}
