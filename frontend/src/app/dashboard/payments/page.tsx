'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PaymentsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/settings?section=subscription');
  }, [router]);

  return null;
}
