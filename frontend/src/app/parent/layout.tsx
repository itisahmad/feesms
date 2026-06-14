'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const AUTH_PATHS = ['/parent/login', '/parent/register', '/parent/forgot-password'];

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isAuthPage = AUTH_PATHS.includes(pathname);
  const isProfilePage = pathname.startsWith('/parent/students/');

  useEffect(() => {
    if (loading) return;
    if (!user && !isAuthPage) {
      router.replace('/parent/login');
      return;
    }
    if (user && user.role !== 'parent' && !isAuthPage) {
      router.replace('/dashboard');
      return;
    }
    if (user?.role === 'parent' && isAuthPage) {
      router.replace('/parent');
    }
  }, [user, loading, router, isAuthPage]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (isProfilePage) {
    return <>{children}</>;
  }

  if (!user || user.role !== 'parent') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f7]">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/parent" className="text-lg font-bold text-teal-800">
            SchoolFee <span className="text-teal-600">Parent</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              href="/parent"
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                pathname === '/parent' ? 'text-teal-700' : 'text-gray-600 hover:text-teal-700'
              }`}
            >
              <Users className="h-4 w-4" />
              My children
            </Link>
            <button
              type="button"
              onClick={logout}
              className="text-sm font-medium text-gray-600 hover:text-teal-700"
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
