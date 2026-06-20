'use client';

import { AuthShell } from '@/components/auth/auth-shell';

type ParentAuthShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
};

export function ParentAuthShell({
  children,
  title = 'Parent Portal',
  subtitle = 'SchoolFee Pro',
}: ParentAuthShellProps) {
  return (
    <AuthShell title={title} subtitle={subtitle} effect="net">
      {children}
    </AuthShell>
  );
}
