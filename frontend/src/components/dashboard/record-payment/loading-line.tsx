'use client';

export function RecordPaymentLoadingLine({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-2 text-sm text-slate-500">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-500 border-t-teal-400" />
      {label}
    </div>
  );
}
