'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GraduationCap, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getParentChildren, type ParentChild } from '@/lib/api';

export default function ParentHomePage() {
  const { user } = useAuth();
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getParentChildren()
      .then(({ data }) => setChildren(data))
      .catch(() => {
        setChildren([]);
        setError('Could not load children.');
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium uppercase tracking-wide text-teal-700">My children</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">{user?.school_name || 'School'}</h1>
        <p className="mt-1 text-sm text-gray-600">Signed in as {user?.phone || 'parent'}</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : children.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <p className="text-gray-600">No active students linked to your phone number.</p>
          <p className="mt-2 text-sm text-gray-500">Contact the school if your child is enrolled but not shown here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/parent/students/${child.id}`}
              className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 group-hover:text-teal-800">{child.name}</h2>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-300 group-hover:text-teal-500" />
                  </div>
                  <p className="text-sm text-gray-600">
                    {child.class_name}
                    {child.section_name ? ` · ${child.section_name}` : ''}
                  </p>
                  <p className="mt-2 text-xs text-gray-500">
                    Adm. {child.admission_number || '—'}
                    {child.roll_number ? ` · Roll ${child.roll_number}` : ''}
                  </p>
                </div>
              </div>
              <p className="mt-4 text-xs font-medium text-teal-600">View profile →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
