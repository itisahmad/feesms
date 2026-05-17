'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  IndianRupee,
  Clock,
  TrendingUp,
  Users,
  Bell,
  ArrowRight,
  UserPlus,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { getDashboard, sendReminder } from '@/lib/api';
import { StatCard } from '@/components/dashboard/stat-card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ClassSummary {
  class_name: string;
  total_due: number;
  total_paid: number;
  total_pending: number;
  student_count: number;
}

interface Defaulter {
  student_id: number;
  student_name: string;
  class_name: string;
  pending: number;
}

interface DashboardData {
  total_due: number;
  total_collected: number;
  total_pending: number;
  students_count: number;
  unpaid_count: number;
  collection_rate?: number;
  class_wise?: ClassSummary[];
  top_defaulters?: Defaulter[];
  current_month: number;
  current_year: number;
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState(false);

  useEffect(() => {
    getDashboard()
      .then(({ data }) => setData(data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const handleReminder = async () => {
    setReminding(true);
    try {
      const { data } = await sendReminder('both');
      toast.success(data?.message || 'Reminders sent');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Failed to send reminder');
    } finally {
      setReminding(false);
    }
  };

  const monthName = data ? MONTHS[data.current_month] : '';
  const year = data?.current_year || new Date().getFullYear();
  const rate = data?.collection_rate ?? 0;

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mb-1 flex items-center gap-2 text-sm text-teal-400/90"
          >
            <Sparkles className="h-4 w-4" />
            Live overview · {monthName} {year}
          </motion.p>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            Command <span className="text-gradient">Center</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-slate-500">
            Your fee pulse at a glance — collection, pending dues, and who needs attention today.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white shadow-lg shadow-teal-500/25 hover:from-teal-400 hover:to-cyan-400 border-0"
          >
            <Link href="/dashboard/fees">
              Collect fees
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={handleReminder}
            disabled={reminding || (data?.unpaid_count ?? 0) === 0}
            aria-busy={reminding}
            className="rounded-xl border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white"
          >
            <Bell className="mr-2 h-4 w-4" />
            {reminding ? 'Sending…' : 'Send reminders'}
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={container}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          title="Total collected"
          value={data?.total_collected ?? 0}
          prefix="₹"
          subtitle={`of ₹${(data?.total_due ?? 0).toLocaleString('en-IN')} due · Up to ${monthName} ${year}`}
          icon={IndianRupee}
          accent="teal"
          delay={0}
        />
        <StatCard
          title="Pending"
          value={data?.total_pending ?? 0}
          prefix="₹"
          subtitle={`${data?.unpaid_count ?? 0} fee records outstanding`}
          icon={Clock}
          accent="amber"
          delay={0.08}
        />
        <StatCard
          title="Collection rate"
          value={rate}
          suffix="%"
          subtitle={`Performance up to ${monthName} ${year}`}
          icon={TrendingUp}
          accent="cyan"
          delay={0.16}
        />
        <StatCard
          title="Active students"
          value={data?.students_count ?? 0}
          subtitle="Enrolled & active"
          icon={Users}
          accent="violet"
          delay={0.24}
        />
      </motion.div>

      {/* Collection rate hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-panel-strong relative overflow-hidden p-6 md:p-8"
      >
        <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
        <motion.div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-white">Collection momentum</h2>
            <p className="mt-1 text-sm text-slate-500">
              {rate >= 80
                ? 'Strong month — keep the streak going.'
                : rate >= 50
                  ? 'On track — a few follow-ups could close the gap.'
                  : 'Focus on defaulters below to lift this rate.'}
            </p>
            <div className="mt-6 max-w-xl">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-slate-400">Progress</span>
                <span className="font-semibold tabular-nums text-teal-300">{rate}%</span>
              </div>
              <Progress value={rate} className="h-3" />
            </div>
          </div>
          <motion.div
            className="relative flex h-36 w-36 shrink-0 items-center justify-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.5, type: 'spring' }}
          >
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="8"
              />
              <motion.circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="url(#rateGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={264}
                initial={{ strokeDashoffset: 264 }}
                animate={{ strokeDashoffset: 264 - (264 * rate) / 100 }}
                transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
              />
              <defs>
                <linearGradient id="rateGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="100%" stopColor="#22d3ee" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-3xl font-bold tabular-nums text-white">{rate}%</span>
          </motion.div>
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Class table */}
        {(data?.class_wise?.length ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="glass-panel overflow-hidden xl:col-span-2"
          >
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Class-wise summary</h2>
              <p className="text-sm text-slate-500">Tap a row to collect fees</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-slate-500">
                    <th className="px-6 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 text-right font-medium">Due</th>
                    <th className="px-4 py-3 text-right font-medium">Collected</th>
                    <th className="px-4 py-3 text-right font-medium">Pending</th>
                    <th className="px-4 py-3 text-right font-medium">Students</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(data?.class_wise || []).map((c, i) => {
                    const pct = c.total_due > 0 ? (c.total_paid / c.total_due) * 100 : 0;
                    return (
                      <motion.tr
                        key={c.class_name}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.05 }}
                        className="group border-b border-white/5 transition hover:bg-white/[0.04]"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-200">{c.class_name}</div>
                          <Progress value={pct} className="mt-2 h-1 max-w-[120px]" />
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums text-slate-400">
                          ₹{c.total_due.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-4 text-right tabular-nums text-teal-400">
                          ₹{c.total_paid.toLocaleString('en-IN')}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-4 text-right font-medium tabular-nums',
                            c.total_pending > 0 ? 'text-amber-400' : 'text-slate-500'
                          )}
                        >
                          ₹{c.total_pending.toLocaleString('en-IN')}
                        </td>
                        <td className="px-4 py-4 text-right text-slate-500">{c.student_count}</td>
                        <td className="px-4 py-4">
                          <Link
                            href={`/dashboard/fees/class/${encodeURIComponent(c.class_name)}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-300 opacity-0 transition group-hover:opacity-100 hover:bg-teal-500/20"
                          >
                            Collect
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* Defaulters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className={cn(
            'glass-panel flex flex-col',
            (data?.class_wise?.length ?? 0) === 0 && 'xl:col-span-3'
          )}
        >
          <div className="border-b border-white/10 px-6 py-4">
            <h2 className="text-lg font-semibold text-white">Top defaulters</h2>
            <p className="text-sm text-slate-500">Highest pending · {monthName} {year}</p>
          </div>
          <div className="flex-1 space-y-2 p-4">
            {(data?.top_defaulters?.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No pending dues — great job!</p>
            ) : (
              (data?.top_defaulters || []).map((d, i) => (
                <motion.div
                  key={d.student_id}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + i * 0.06 }}
                >
                  <Link
                    href={`/dashboard/students/${d.student_id}`}
                    className="group flex items-center justify-between rounded-xl border border-transparent px-4 py-3 transition hover:border-amber-500/20 hover:bg-amber-500/5"
                  >
                    <div>
                      <p className="font-medium text-slate-200 group-hover:text-white">
                        {d.student_name}
                      </p>
                      <p className="text-xs text-slate-500">{d.class_name}</p>
                    </div>
                    <span className="rounded-lg bg-amber-500/10 px-2.5 py-1 text-sm font-semibold tabular-nums text-amber-300">
                      ₹{d.pending.toLocaleString('en-IN')}
                    </span>
                  </Link>
                </motion.div>
              ))
            )}
          </div>
          <motion.div className="border-t border-white/10 p-4">
            <Link
              href="/dashboard/fees"
              className="flex items-center justify-center gap-2 text-sm font-medium text-teal-400 hover:text-teal-300"
            >
              Open fee collection
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Quick actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex flex-wrap gap-3"
      >
        <Button
          asChild
          variant="outline"
          className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
        >
          <Link href="/dashboard/students">
            <UserPlus className="mr-2 h-4 w-4" />
            Add student
          </Link>
        </Button>
      </motion.div>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
