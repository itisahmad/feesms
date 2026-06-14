import type { StudentFeeHistoryData, StudentFeeSummary, StudentMonthlyHistory, StudentPublishedResultSummary } from './types';

export const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatExamDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function computeFeeSummary(data: StudentFeeHistoryData): StudentFeeSummary {
  let totalDue = 0;
  let totalPaid = 0;
  let totalPending = 0;
  for (const m of data.monthly_history) {
    totalDue += m.total_due;
    totalPaid += m.total_paid;
    for (const f of m.fees) {
      if (f.is_payable ?? f.balance > 0) {
        totalPending += f.balance;
      }
    }
  }
  return {
    totalDue,
    totalPaid,
    totalPending,
    monthsWithFees: data.months_with_fees,
  };
}

export function computePerformanceSummary(results: StudentPublishedResultSummary[]) {
  if (!results.length) return null;
  const withPct = results.filter((r) => r.percentage != null);
  const latest = results[0];
  const averagePct =
    withPct.length > 0
      ? Math.round(withPct.reduce((s, r) => s + (r.percentage ?? 0), 0) / withPct.length)
      : null;
  return {
    examCount: results.length,
    latestExam: latest.exam_name,
    latestPercentage: latest.percentage,
    latestGrade: latest.overall_grade,
    averagePercentage: averagePct,
  };
}

export function monthPendingTotal(month: StudentMonthlyHistory): number {
  return month.fees.reduce(
    (sum, fee) => sum + ((fee.is_payable ?? fee.balance > 0) && fee.balance > 0 ? fee.balance : 0),
    0,
  );
}

export function feePaidPercent(summary: StudentFeeSummary): number {
  if (summary.totalDue <= 0) return summary.totalPending <= 0 ? 100 : 0;
  return Math.min(100, Math.round((summary.totalPaid / summary.totalDue) * 100));
}

export function formatProfileDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export type StudentActivity = {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  kind: 'payment' | 'exam';
};

export function collectRecentActivities(
  monthlyHistory: StudentFeeHistoryData['monthly_history'],
  results: StudentPublishedResultSummary[],
  limit = 6,
): StudentActivity[] {
  const activities: StudentActivity[] = [];

  for (const month of monthlyHistory) {
    for (const fee of month.fees) {
      for (const payment of fee.payments) {
        activities.push({
          id: `pay-${fee.id}-${payment.date}-${payment.amount}`,
          title: payment.is_yearly ? `${fee.fee_type} — yearly payment` : `${fee.fee_type} payment`,
          subtitle: `₹${payment.amount.toLocaleString('en-IN')} · ${payment.mode}`,
          date: payment.date,
          kind: 'payment',
        });
      }
    }
  }

  for (const exam of results) {
    activities.push({
      id: `exam-${exam.exam_id}`,
      title: `${exam.exam_name} completed`,
      subtitle:
        exam.percentage != null
          ? `Score ${exam.percentage}%${exam.overall_grade ? ` · Grade ${exam.overall_grade}` : ''}`
          : exam.class_name,
      date: exam.exam_date || '',
      kind: 'exam',
    });
  }

  return activities
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
    .slice(0, limit);
}

export function sortedExamProgress(results: StudentPublishedResultSummary[]) {
  return [...results]
    .filter((r) => r.percentage != null)
    .sort((a, b) => new Date(a.exam_date || 0).getTime() - new Date(b.exam_date || 0).getTime());
}

export async function downloadStudentFeeReceipt(studentFeeId: number, filename: string) {
  const { getReceipt } = await import('@/lib/api');
  const { data } = await getReceipt(studentFeeId);
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadStudentMonthReceipt(
  studentId: number,
  month: number,
  year: number,
  filename: string,
) {
  const { generateReceiptPdf } = await import('@/lib/api');
  const { data } = await generateReceiptPdf({
    student_id: studentId,
    receipt_type: 'monthly',
    month,
    year,
  });
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadParentChildReceipt(studentId: number, studentFeeId: number, filename: string) {
  const { getParentChildReceipt } = await import('@/lib/api');
  const { data } = await getParentChildReceipt(studentId, studentFeeId);
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadParentChildMonthReceipt(
  studentId: number,
  month: number,
  year: number,
  filename: string,
) {
  const { getParentChildMonthReceipt } = await import('@/lib/api');
  const { data } = await getParentChildMonthReceipt(studentId, month, year);
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
