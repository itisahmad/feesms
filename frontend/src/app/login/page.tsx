'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { AuthShell } from '@/components/auth/auth-shell';

const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, user } = useAuth();

  if (user) {
    window.location.href = user.role === 'parent' ? '/parent' : '/dashboard';
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { detail?: string } } };
      setError(axErr?.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="SchoolFee Pro"
      subtitle="Fee Management for Bihar Schools"
      effect="halo"
    >
      <h2 className="mb-6 text-xl font-semibold text-gray-900">School owner sign in</h2>
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
        )}
        <div>
          <label htmlFor="email" className={labelClass}>
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="Your registered email"
            required
          />
          <p className="mt-1.5 text-xs text-gray-500">
            Use the email address from school registration.
          </p>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Password
            </label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
            placeholder="Enter password"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-600 py-3 font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-teal-600 hover:underline">
          Register your school
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-gray-600">
        School staff?{' '}
        <Link href="/login/staff" className="font-medium text-teal-600 hover:underline">
          Sign in as school staff
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-gray-600">
        Parent?{' '}
        <Link href="/parent/login" className="font-medium text-teal-600 hover:underline">
          Sign in to parent portal
        </Link>
      </p>
    </AuthShell>
  );
}
