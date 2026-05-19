'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  ClipboardList,
  FileText,
  Wallet,
  CreditCard,
  Receipt,
  ClipboardCheck,
  Megaphone,
  Settings,
  UserCog,
  LogOut,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { MeshBackground } from '@/components/dashboard/mesh-background';
import { formatSchoolPlanLabel } from '@/lib/plan-labels';
import { firstAllowedPath, pathnameToModuleKey } from '@/lib/staff-modules';
import { cn } from '@/lib/utils';

const SIDEBAR_WIDTH = 260;
const STORAGE_KEY = 'dashboard-sidebar-collapsed';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, moduleKey: 'dashboard' },
  { href: '/dashboard/classes', label: 'Classes', icon: GraduationCap, moduleKey: 'classes' },
  { href: '/dashboard/students', label: 'Students', icon: Users, moduleKey: 'students' },
  { href: '/dashboard/enquiries', label: 'Enquiries', icon: ClipboardList, moduleKey: 'enquiries' },
  { href: '/dashboard/fee-structure', label: 'Fee Structure', icon: FileText, moduleKey: 'fee_structure' },
  { href: '/dashboard/fees', label: 'Fee Collection', icon: Wallet, moduleKey: 'fee_collection' },
  { href: '/dashboard/payments', label: 'Payments', icon: CreditCard, moduleKey: 'payments' },
  { href: '/dashboard/receipt-templates', label: 'Receipt Templates', icon: Receipt, moduleKey: 'receipt_templates' },
  { href: '/dashboard/results', label: 'Results', icon: ClipboardCheck, moduleKey: 'results' },
  { href: '/dashboard/announcements', label: 'Announcements', icon: Megaphone, moduleKey: 'announcements' },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings, moduleKey: 'settings' },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === 'true');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = '/login';
    }
  }, [user, loading]);

  const isOwner = user?.role === 'owner' || user?.is_owner;
  const allowedModules = user?.allowed_modules ?? [];

  useEffect(() => {
    if (loading || !user || isOwner) return;
    const fallback = firstAllowedPath(allowedModules);
    const moduleKey = pathnameToModuleKey(pathname);
    if (!moduleKey) return;
    if (moduleKey === 'staff' || (moduleKey && !allowedModules.includes(moduleKey))) {
      if (fallback && pathname !== fallback) {
        router.replace(fallback);
      }
    }
  }, [loading, user, isOwner, pathname, allowedModules, router]);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  if (loading || !user) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#0a0f1a]"
        style={{ background: 'var(--dash-mesh-bg)' }}
      >
        <motion.div
          className="h-12 w-12 rounded-full border-2 border-teal-400/30 border-t-teal-400"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  if (!isOwner && allowedModules.length === 0) {
    return (
      <motion.div
        className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ background: 'var(--dash-mesh-bg)' }}
      >
        <MeshBackground />
        <h1 className="relative z-10 text-xl font-semibold text-white">No module access</h1>
        <p className="relative z-10 mt-2 max-w-md text-slate-400">
          Your account has no dashboard modules assigned. Ask the school owner to update your permissions under Staff.
        </p>
        <button
          type="button"
          onClick={logout}
          className="relative z-10 mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-300 hover:bg-white/10"
        >
          Sign out
        </button>
      </motion.div>
    );
  }

  const menuItems = (() => {
    const staffNav = { href: '/dashboard/staff', label: 'Staff', icon: UserCog, moduleKey: 'staff' };
    if (isOwner) {
      return [...nav, staffNav];
    }
    return nav.filter((item) => allowedModules.includes(item.moduleKey));
  })();

  const planLabel = formatSchoolPlanLabel(user.school_plan);

  const mainMargin = mounted && collapsed ? 0 : SIDEBAR_WIDTH;

  return (
    <div className="relative min-h-screen text-[var(--dash-text-body)] transition-colors duration-300">
      <MeshBackground />

      <AnimatePresence>
        {!collapsed && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
            onClick={toggleSidebar}
            aria-label="Close navigation"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: collapsed ? -SIDEBAR_WIDTH : 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="fixed left-0 top-0 z-40 flex h-full w-[260px] flex-col border-r backdrop-blur-2xl"
        style={{
          background: 'var(--dash-sidebar)',
          borderColor: 'var(--dash-glass-border)',
        }}
        aria-hidden={collapsed}
      >
        <div
          className="relative border-b p-6"
          style={{ borderColor: 'var(--dash-glass-border)' }}
        >
          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute right-3 top-3 rounded-lg p-2 text-[var(--dash-text-muted)] transition hover:bg-[var(--dash-hover)] hover:text-[var(--dash-text-title)]"
            aria-label="Hide sidebar"
            title="Hide sidebar"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
          <Link href="/dashboard" className="group flex items-center gap-2 pr-10">
            <motion.div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 shadow-lg shadow-teal-500/25"
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <Sparkles className="h-5 w-5 text-white" />
            </motion.div>
            <div className="min-w-0">
              <span className="text-lg font-bold tracking-tight text-[var(--dash-text-title)]">
                SchoolFee
              </span>
              <span className="text-gradient ml-0.5 text-lg font-bold">Pro</span>
            </div>
          </Link>
          <p className="mt-3 truncate text-xs text-[var(--dash-text-muted)]">{user.school_name}</p>
          <span className="mt-2 inline-flex items-center rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-teal-300">
            {planLabel}
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {menuItems.map((item, i) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link
                  href={item.href}
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                      setCollapsed(true);
                      try {
                        localStorage.setItem(STORAGE_KEY, 'true');
                      } catch {
                        /* ignore */
                      }
                    }
                  }}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                    active
                      ? 'bg-gradient-to-r from-teal-500/20 to-cyan-500/10 text-[var(--dash-nav-active-text)] shadow-[inset_0_0_20px_rgba(45,212,191,0.08)]'
                      : 'text-[var(--dash-nav-text)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-text-title)]'
                  )}
                >
                  {active && (
                    <motion.div
                      layoutId="nav-active"
                      className="absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-teal-400 to-cyan-400"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={cn(
                      'h-5 w-5 shrink-0 transition-colors',
                      active
                        ? 'text-teal-400'
                        : 'text-[var(--dash-text-muted)] group-hover:text-teal-400/80'
                    )}
                  />
                  {item.label}
                </Link>
              </motion.div>
            );
          })}
        </nav>

        <div className="border-t p-4" style={{ borderColor: 'var(--dash-glass-border)' }}>
          <div className="mb-3 rounded-xl px-3 py-2" style={{ background: 'var(--dash-glass-bg)' }}>
            <p className="text-sm font-medium text-[var(--dash-text-title)]">
              {user.first_name} {user.last_name}
            </p>
            <p className="text-xs capitalize text-[var(--dash-text-muted)]">{user.role}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--dash-text-muted)] transition hover:bg-red-500/10 hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </motion.aside>

      <motion.main
        initial={false}
        animate={{ marginLeft: mainMargin }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="relative min-h-screen p-4 md:p-8"
      >
        <AnimatePresence>
          {collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              className="mb-4 flex flex-wrap items-center gap-2"
            >
              <button
                type="button"
                onClick={toggleSidebar}
                className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium backdrop-blur-xl transition hover:border-teal-500/30"
                style={{
                  borderColor: 'var(--dash-glass-border)',
                  background: 'var(--dash-glass-bg)',
                  color: 'var(--dash-text-body)',
                }}
                aria-label="Show sidebar"
                title="Show sidebar"
              >
                <PanelLeft className="h-5 w-5 text-teal-400" />
                Menu
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {children}
      </motion.main>
    </div>
  );
}
