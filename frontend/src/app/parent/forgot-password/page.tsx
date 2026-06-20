'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { ParentAuthShell } from '@/components/parent/parent-auth-shell';
import { parentForgotPasswordSendOTP } from '@/lib/api';

const labelClass = 'block text-sm font-medium text-gray-700 mb-1.5';
const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/25';

type Step = 'details' | 'reset';

export default function ParentForgotPasswordPage() {
  const [step, setStep] = useState<Step>('details');
  const [schoolCode, setSchoolCode] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState('');
  const [debugHint, setDebugHint] = useState('');
  const [loading, setLoading] = useState(false);
  const { parentResetPassword } = useAuth();

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDebugHint('');
    setLoading(true);
    try {
      const { data } = await parentForgotPasswordSendOTP(schoolCode.trim(), phone.trim());
      if (data.debug_otp_logged) {
        setDebugHint(
          'SMS not sent — for testing enter 123456, or check the backend server log for the OTP code (DEBUG mode).',
        );
      }
      setStep('reset');
    } catch (err: unknown) {
      const axErr = err as { response?: { status?: number; data?: { error?: string } } };
      const apiError = axErr?.response?.data?.error;
      if (apiError) {
        setError(apiError);
      } else if (axErr?.response?.status === 404) {
        setError('Password reset service is unavailable. Restart the backend server and try again.');
      } else {
        setError('Failed to send verification code. Check school code and mobile number.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== password2) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await parentResetPassword({
        school_code: schoolCode.trim(),
        phone: phone.trim(),
        otp: otp.trim(),
        password,
        password2,
      });
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Failed to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ParentAuthShell subtitle="Reset your password">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        {step === 'details' ? 'Verify your phone' : 'Set new password'}
      </h2>

      {step === 'details' ? (
            <form onSubmit={handleSendOTP} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
              )}
              <p className="text-sm text-gray-600">
                Enter your school code and the mobile number on your child&apos;s school record. We&apos;ll send a
                verification code by SMS.
              </p>
              <div>
                <label htmlFor="schoolCode" className={labelClass}>
                  School code
                </label>
                <input
                  id="schoolCode"
                  value={schoolCode}
                  onChange={(e) => setSchoolCode(e.target.value)}
                  className={inputClass}
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
                  inputMode="numeric"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-teal-600 py-3 font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send verification code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleReset} className="space-y-5">
              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>
              )}
              {debugHint && (
                <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">{debugHint}</div>
              )}
              <p className="text-sm text-gray-600">
                Enter the code sent to <span className="font-medium">{phone}</span>, then choose a new password.
              </p>
              <div>
                <label htmlFor="otp" className={labelClass}>
                  Verification code
                </label>
                <input
                  id="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className={inputClass}
                  inputMode="numeric"
                  maxLength={6}
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className={labelClass}>
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label htmlFor="password2" className={labelClass}>
                  Confirm new password
                </label>
                <input
                  id="password2"
                  type="password"
                  value={password2}
                  onChange={(e) => setPassword2(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-teal-600 py-3 font-medium text-white transition hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? 'Resetting…' : 'Reset password & sign in'}
              </button>
              <button
                type="button"
                onClick={() => setStep('details')}
                className="w-full text-sm text-gray-500 hover:text-gray-700"
              >
                Back
              </button>
            </form>
          )}

      <p className="mt-6 text-center text-sm text-gray-600">
        Remember your password?{' '}
        <Link href="/parent/login" className="font-medium text-teal-600 hover:underline">
          Sign in
        </Link>
      </p>
      <p className="mt-2 text-center text-sm text-gray-600">
        No account yet?{' '}
        <Link href="/parent/register" className="font-medium text-teal-600 hover:underline">
          Register with OTP
        </Link>
      </p>
    </ParentAuthShell>
  );
}
