'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CreditCard, UserCircle } from 'lucide-react';
import { getParentChildProfile, getParentStudentExamReport } from '@/lib/api';
import { ParentPayFeesModal } from '@/components/parent/parent-pay-fees-modal';
import { StudentResultReportModal } from '@/components/dashboard/student-result-report-modal';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell } from '@/components/dashboard/page-shell';
import { PageLoading } from '@/components/dashboard/loading-state';
import { MeshBackground } from '@/components/dashboard/mesh-background';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import {
  StudentProfileHeader,
  StudentProfileOverview,
  StudentPaymentsSection,
  StudentResultsSection,
  StudentAttendanceSection,
  computeFeeSummary,
  downloadParentChildReceipt,
  downloadParentChildMonthReceipt,
  MONTHS,
  type ParentChildProfile,
} from '@/components/student-profile';

export default function ParentStudentProfilePage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const [data, setData] = useState<ParentChildProfile | null>(null);
  const [loading, setLoading] = useState(true);
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
    getParentChildProfile(id)
      .then(({ data: res }) => setData(res as ParentChildProfile))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleDownloadReceipt = useCallback(
    async (feeId: number, feeType: string, month: number, year: number) => {
      const safeName = (data?.student.name || 'student').replace(/\s+/g, '-').slice(0, 30);
      await downloadParentChildReceipt(
        id,
        feeId,
        `receipt-${safeName}-${feeType}-${MONTHS[month]}-${year}.pdf`,
      );
    },
    [id, data?.student.name],
  );

  const handleDownloadMonthReceipt = useCallback(
    async (month: number, year: number) => {
      const safeName = (data?.student.name || 'student').replace(/\s+/g, '-').slice(0, 30);
      await downloadParentChildMonthReceipt(
        id,
        month,
        year,
        `receipt-${safeName}-${MONTHS[month]}-${year}.pdf`,
      );
    },
    [id, data?.student.name],
  );

  if (loading) {
    return (
      <div className="relative min-h-screen" style={{ background: 'var(--dash-mesh-bg)' }}>
        <MeshBackground />
        <PageLoading />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="relative min-h-screen px-4 py-12" style={{ background: 'var(--dash-mesh-bg)' }}>
        <MeshBackground />
        <div className="relative z-10 mx-auto max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
          <p className="text-slate-300">Student not found or not linked to your account.</p>
          <Link href="/parent" className={cn(dash.link, 'mt-4 inline-block')}>
            Back to my children
          </Link>
        </div>
      </div>
    );
  }

  const { student, admission_date, yearly_payments = [], monthly_history, published_results = [], allow_parent_online_payment = false, attendance_summary } = data;
  const feeSummary = computeFeeSummary(data);
  const showPayButton = allow_parent_online_payment && feeSummary.totalPending > 0;

  const openPayModal = (month?: number, year?: number) => {
    if (month != null && year != null) {
      setPayModalMonth({ month, year });
    } else {
      setPayModalMonth(null);
    }
    setShowPayModal(true);
  };

  const scrollToPayments = () => {
    document.getElementById('student-payments')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="relative min-h-screen text-[var(--dash-text-body)]" style={{ background: 'var(--dash-mesh-bg)' }}>
      <MeshBackground />
      <PageShell className="relative z-10 !space-y-4">
        <div className="space-y-3">
          <Link href="/parent" className={cn(dash.link, 'inline-flex items-center gap-1.5')}>
            <ArrowLeft className="h-4 w-4" />
            My children
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <PageHeader
              icon={UserCircle}
              eyebrow="Student profile"
              title={student.name}
              subtitle={student.class_name}
            />
            {showPayButton ? (
              <Button
                type="button"
                onClick={() => openPayModal()}
                className="shrink-0 rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Pay fees (₹{feeSummary.totalPending.toLocaleString('en-IN')})
              </Button>
            ) : null}
          </div>
        </div>

        <StudentProfileHeader
          student={student}
          admissionDate={admission_date}
          feeSummary={feeSummary}
          publishedResults={published_results}
          readOnly
          onViewFees={scrollToPayments}
        />

        <StudentProfileOverview
          studentId={id}
          publishedResults={published_results}
          fetchExamReport={(examId, studentId) => getParentStudentExamReport(studentId, examId)}
          onOpenExam={(examId, examName) => setSelectedExam({ id: examId, name: examName })}
        />

        <StudentAttendanceSection summary={attendance_summary} />

        <StudentResultsSection
          results={published_results}
          readOnly
          onOpenExam={(examId, examName) => setSelectedExam({ id: examId, name: examName })}
        />

        <StudentPaymentsSection
          id="student-payments"
          monthlyHistory={monthly_history}
          yearlyPayments={yearly_payments}
          studentName={student.name}
          readOnly
          allowParentOnlinePayment={allow_parent_online_payment}
          onDownloadReceipt={handleDownloadReceipt}
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
            fetchReport={getParentStudentExamReport}
            onClose={() => setSelectedExam(null)}
          />
        ) : null}
      </PageShell>
    </div>
  );
}
