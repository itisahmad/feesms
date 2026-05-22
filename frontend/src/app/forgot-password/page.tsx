'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [resetLink, setResetLink] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setResetLink('');
    try {
      const { data } = await forgotPassword(value);
      setMessage(data?.message || 'If account exists, reset instructions have been generated.');
      if (data?.reset_path) {
        setResetLink(data.reset_path as string);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setMessage(msg || 'Failed to process request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-teal-50 via-amber-50/30 to-teal-50 p-4">
      <div className="auth-surface w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-xl">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Forgot password</h1>
        <p className="mb-6 text-sm text-gray-600">
          School owners: enter your registered email. Staff: enter your username.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email or username
            </label>
            <input
              id="identifier"
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Owner: email · Staff: username"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Generate reset link'}
          </button>
        </form>

        {message && <p className="text-sm text-gray-700 mt-4">{message}</p>}
        {resetLink && (
          <Link href={resetLink} className="inline-block mt-3 text-teal-600 hover:underline text-sm font-medium">
            Open reset password page
          </Link>
        )}

        <p className="mt-6 text-sm text-gray-600">
          Back to{' '}
          <Link href="/login" className="text-teal-600 hover:underline font-medium">Login</Link>
        </p>
      </div>
    </div>
  );
}
