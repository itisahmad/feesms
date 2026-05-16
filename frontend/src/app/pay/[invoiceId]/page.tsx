'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Public landing for platform invoice payment links sent in SMS.
 * Wire this page to your checkout flow when ready.
 */
export default function PayInvoicePage() {
  const params = useParams();
  const invoiceId = params?.invoiceId as string;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Invoice payment</h1>
        <p className="text-sm text-gray-600 mb-6">
          Reference invoice <span className="font-mono text-teal-700">{invoiceId}</span>. Complete payment from your
          school dashboard or contact support if you need help.
        </p>
        <Link href="/login" className="inline-block px-5 py-2.5 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700">
          Go to login
        </Link>
      </div>
    </div>
  );
}
