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
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Forgot password</h1>
        <p className="text-sm text-gray-600 mb-6">Enter username or email to generate reset link.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Username or email"
            className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:ring-2 focus:ring-teal-500 outline-none"
            required
          />
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
