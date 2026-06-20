'use client';

import { VantaBackground, type VantaAuthEffect } from '@/components/auth/vanta-background';
import { cn } from '@/lib/utils';

type AuthShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  effect: VantaAuthEffect;
  overlayClassName?: string;
  maxWidthClass?: string;
  contentClassName?: string;
};

const OVERLAYS: Record<VantaAuthEffect, string> = {
  net: 'bg-gradient-to-b from-teal-950/20 via-transparent to-teal-950/35',
  halo: 'bg-gradient-to-br from-teal-950/15 via-transparent to-amber-950/20',
  rings: 'bg-gradient-to-b from-slate-950/20 via-teal-950/10 to-slate-950/25',
};

export function AuthShell({
  children,
  title,
  subtitle,
  effect,
  overlayClassName,
  maxWidthClass = 'max-w-md',
  contentClassName,
}: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <VantaBackground effect={effect} />
      <div
        className={cn(
          'pointer-events-none absolute inset-0',
          OVERLAYS[effect],
          overlayClassName,
        )}
      />
      <div className={cn('relative z-10 flex min-h-screen items-center justify-center p-4 py-12', contentClassName)}>
        <div className={cn('w-full', maxWidthClass)}>
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">{title}</h1>
            {subtitle ? (
              <p className="mt-1 text-sm text-white/75">{subtitle}</p>
            ) : null}
          </div>
          <div className="auth-surface rounded-2xl border border-white/20 bg-white/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
