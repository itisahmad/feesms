'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/dashboard/classes', label: 'Classes', icon: '📚' },
  { href: '/dashboard/students', label: 'Students', icon: '👥' },
  { href: '/dashboard/fee-structure', label: 'Fee Structure', icon: '📋' },
  { href: '/dashboard/fees', label: 'Fee Collection', icon: '💰' },
  { href: '/dashboard/inventory', label: 'Inventory', icon: '📦' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login';
    }
  }, [user, loading]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#faf9f7]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      </div>
    );
  }

  const menuItems = user.role === 'owner'
    ? [...nav, { href: '/dashboard/staff', label: 'Staff Login', icon: '🧑‍💼' }]
    : nav;

  return (
    <div className="min-h-screen flex bg-[#faf9f7]">
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col fixed h-full">
        <div className="p-6 border-b border-gray-100">
          <Link href="/dashboard" className="text-xl font-bold text-teal-700">
            SchoolFee Pro
          </Link>
          <p className="text-xs text-gray-500 mt-1">{user.school_name}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition ${
                pathname === item.href
                  ? 'bg-teal-50 text-teal-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <div className="text-sm text-gray-600 mb-2">
            {user.first_name} {user.last_name}
          </div>
          <button
            onClick={logout}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-64 p-8">{children}</main>
    </div>
  );
}
