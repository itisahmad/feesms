'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { confirmVerifyParentPhone, sendVerifyParentPhone } from '@/lib/api';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';

type Step = 'send' | 'verify' | 'success';

type ParentPhoneVerifyModalProps = {
  phone: string;
  onClose: () => void;
  onVerified: (phone: string) => void;
};

export function ParentPhoneVerifyModal({ phone, onClose, onVerified }: ParentPhoneVerifyModalProps) {
  const [step, setStep] = useState<Step>('send');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [debugHint, setDebugHint] = useState('');

  useEffect(() => {
    setStep('send');
    setOtp('');
    setError('');
    setDebugHint('');
  }, [phone]);

  const handleSend = async () => {
    setLoading(true);
    setError('');
    setDebugHint('');
    try {
      const { data } = await sendVerifyParentPhone(phone);
      setStep('verify');
      if (data.debug_otp_logged) {
        setDebugHint('SMS not sent — for testing enter 123456, or check the backend server log for the OTP code (DEBUG mode).');
      }
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (otp.replace(/\D/g, '').length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await confirmVerifyParentPhone(phone, otp.trim());
      setStep('success');
      onVerified(data.phone);
    } catch (err: unknown) {
      const axErr = err as { response?: { data?: { error?: string } } };
      setError(axErr?.response?.data?.error || 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardModal
      title="Verify parent phone"
      subtitle={`We'll send a 6-digit code to ${phone}`}
      onClose={onClose}
    >
      {step === 'send' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Parents will use this number with your school code when the parent portal launches. Verify it now before saving the student.
          </p>
          {error && <p className={dash.error}>{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleSend}
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send code'
              )}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl border-white/15 bg-white/5">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">Enter the code sent to {phone}.</p>
          {debugHint && <p className="text-xs text-amber-400">{debugHint}</p>}
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={cn(dash.field, 'text-center text-lg tracking-[0.35em]')}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            autoFocus
          />
          {error && <p className={dash.error}>{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Confirm code'
              )}
            </Button>
            <Button type="button" variant="outline" onClick={handleSend} disabled={loading} className="rounded-xl border-white/15 bg-white/5">
              Resend code
            </Button>
          </div>
        </div>
      )}

      {step === 'success' && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/20 text-teal-300">
            <Check className="h-6 w-6" />
          </div>
          <p className="text-sm text-slate-300">Phone number verified. You can save the student now.</p>
          <Button type="button" onClick={onClose} className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 border-0">
            Done
          </Button>
        </div>
      )}
    </DashboardModal>
  );
}
