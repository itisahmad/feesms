'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { register } from '@/lib/api';
import { AuthShell } from '@/components/auth/auth-shell';

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    password2: '',
    first_name: '',
    last_name: '',
    phone: '',
    school_name: '',
    school_city: 'Muzaffarpur',
    school_phone: '',
  });
  const [error, setError] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setError((err) => ({ ...err, [name]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError({});
    setLoading(true);
    try {
      const { data } = await register(form);
      localStorage.setItem('access', data.tokens.access);
      localStorage.setItem('refresh', data.tokens.refresh);
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: Record<string, string[]> } };
      const data = axErr?.response?.data;
      if (data) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) {
          if (Array.isArray(v)) errs[k] = v[0];
          else errs[k] = String(v);
        }
        setError(errs);
      } else {
        setError({ general: 'Registration failed. Please try again.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="SchoolFee Pro"
      subtitle="Register your school — 30-day free trial"
      effect="halo"
      maxWidthClass="max-w-lg"
    >
      <h2 className="mb-6 text-xl font-semibold text-gray-900">Create account</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error.general && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.general}</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">First name</label>
            <input
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Last name</label>
            <input
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              className={inputClass}
              required
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={handleChange}
            className={inputClass}
            placeholder="you@school.com"
            required
          />
          {error.email && <p className="mt-1 text-sm text-red-600">{error.email}</p>}
          <p className="mt-1 text-xs text-gray-500">You will sign in with this email and your password.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Phone</label>
          <input
            name="phone"
            value={form.phone}
            onChange={handleChange}
            className={inputClass}
            placeholder="10-digit mobile"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              className={inputClass}
              required
            />
            {error.password && <p className="mt-1 text-sm text-red-600">{error.password}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm</label>
            <input
              name="password2"
              type="password"
              value={form.password2}
              onChange={handleChange}
              className={inputClass}
              required
            />
          </div>
        </div>
        <hr className="border-gray-200" />
        <p className="text-sm font-medium text-gray-700">School details</p>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">School name</label>
          <input
            name="school_name"
            value={form.school_name}
            onChange={handleChange}
            className={inputClass}
            placeholder="e.g. ABC Public School"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">City</label>
          <input
            name="school_city"
            value={form.school_city}
            onChange={handleChange}
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">School phone</label>
          <input
            name="school_phone"
            value={form.school_phone}
            onChange={handleChange}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-teal-600 py-3 font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          {loading ? 'Creating account...' : 'Register school'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-teal-600 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
