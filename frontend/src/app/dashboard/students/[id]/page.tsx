'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, UserCircle } from 'lucide-react';
import { getStudentFeeHistory, getStudentPublishedResults } from '@/lib/api';
import { ParentPayFeesModal } from '@/components/parent/parent-pay-fees-modal';
import { StudentResultReportModal } from '@/components/dashboard/student-result-report-modal';
import { usePermissions } from '@/hooks/use-permissions';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { PageLoading } from '@/components/dashboard/loading-state';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import {
  StudentProfileHeader,
  StudentProfileOverview,
  StudentPaymentsSection,
  StudentResultsSection,
  computeFeeSummary,
  downloadStudentMonthReceipt,
  MONTHS,
  type StudentFeeHistoryData,
  type StudentPublishedResultSummary,
} from '@/components/student-profile';

export default function StudentDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const { canView } = usePermissions();
  const showResults = canView('results');
  const [data, setData] = useState<StudentFeeHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishedResults, setPublishedResults] = useState<StudentPublishedResultSummary[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [selectedExam, setSelectedExam] = useState<{ id: number; name: string } | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payModalMonth, setPayModalMonth] = useState<{ month: number; year: number } | null>(null);

  const loadProfile = useCallback(() => {
    if (Number.isNaN(id)) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    getStudentFeeHistory(id)
      .then(({ data: res }) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!showResults || !id || Number.isNaN(id)) return;
    setResultsLoading(true);
    getStudentPublishedResults(id)
      .then(({ data: res }) => setPublishedResults(res.results || []))
      .catch(() => setPublishedResults([]))
      .finally(() => setResultsLoading(false));
  }, [id, showResults]);

  const scrollToPayments = () => {
    document.getElementById('student-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return <PageLoading />;

  if (!data) {
    return (
      <PageShell>
        <GlassCard>
          <p className={cn(dash.error, 'm-6')}>
            Student not found.{' '}
            <Link href="/dashboard/students" className={dash.link}>
              Back to students
            </Link>
          </p>
        </GlassCard>
      </PageShell>
    );
  }

  const { student, admission_date, yearly_payments = [], monthly_history, allow_parent_online_payment = false } = data;
  const feeSummary = computeFeeSummary(data);

  const openPayModal = (month?: number, year?: number) => {
    if (month != null && year != null) {
      setPayModalMonth({ month, year });
    } else {
      setPayModalMonth(null);
    }
    setShowPayModal(true);
  };

  const handleDownloadMonthReceipt = async (month: number, year: number) => {
    const safeName = student.name.replace(/\s+/g, '-').slice(0, 30);
    await downloadStudentMonthReceipt(
      id,
      month,
      year,
      `receipt-${safeName}-${MONTHS[month]}-${year}.pdf`,
    );
  };

  return (
    <PageShell className="!space-y-4">
      <div className="space-y-3">
        <Link href="/dashboard/students" className={cn(dash.link, 'inline-flex items-center gap-1.5')}>
          <ArrowLeft className="h-4 w-4" />
          Back to students
        </Link>

        <PageHeader
          icon={UserCircle}
          eyebrow="Student profile"
          title={student.name}
          subtitle={student.class_name}
        />
      </div>

      <StudentProfileHeader
        student={student}
        admissionDate={admission_date}
        feeSummary={feeSummary}
        publishedResults={publishedResults}
        onViewFees={scrollToPayments}
      />

      {showResults ? (
        <StudentProfileOverview
          studentId={id}
          publishedResults={publishedResults}
          resultsLoading={resultsLoading}
          showResults={showResults}
          onOpenExam={(examId, examName) => setSelectedExam({ id: examId, name: examName })}
        />
      ) : null}

      {showResults ? (
        <StudentResultsSection
          results={publishedResults}
          loading={resultsLoading}
          onOpenExam={(examId, examName) => setSelectedExam({ id: examId, name: examName })}
        />
      ) : null}

      <StudentPaymentsSection
        id="student-payments"
        monthlyHistory={monthly_history}
        yearlyPayments={yearly_payments}
        studentName={student.name}
        allowParentOnlinePayment={allow_parent_online_payment}
        onDownloadMonthReceipt={handleDownloadMonthReceipt}
        onPayMonthOnline={(month, year) => openPayModal(month, year)}
      />

      {showPayModal ? (
        <ParentPayFeesModal
          studentId={id}
          studentName={student.name}
          monthlyHistory={monthly_history}
          filterMonth={payModalMonth?.month}
          filterYear={payModalMonth?.year}
          paymentChannel="staff"
          onClose={() => {
            setShowPayModal(false);
            setPayModalMonth(null);
          }}
          onPaid={() => {
            setShowPayModal(false);
            setPayModalMonth(null);
            loadProfile();
          }}
        />
      ) : null}

      {selectedExam ? (
        <StudentResultReportModal
          examId={selectedExam.id}
          examName={selectedExam.name}
          studentId={id}
          studentName={student.name}
          onClose={() => setSelectedExam(null)}
        />
      ) : null}
    </PageShell>
  );
}
