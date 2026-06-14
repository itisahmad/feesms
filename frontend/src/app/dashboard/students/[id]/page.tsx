'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, UserCircle } from 'lucide-react';
import {
  getStudentFeeHistory,
  getFeeStructures,
  getStudentPublishedResults,
  updateStudent,
} from '@/lib/api';
import { ParentPayFeesModal } from '@/components/parent/parent-pay-fees-modal';
import { StudentResultReportModal } from '@/components/dashboard/student-result-report-modal';
import { usePermissions } from '@/hooks/use-permissions';
import { PageHeader } from '@/components/dashboard/page-header';
import { PageShell, GlassCard } from '@/components/dashboard/page-shell';
import { InlineLoading, PageLoading } from '@/components/dashboard/loading-state';
import { DashboardModal } from '@/components/dashboard/modal';
import { Button } from '@/components/ui/button';
import { dash } from '@/lib/dashboard-ui';
import { cn } from '@/lib/utils';
import {
  StudentProfileHeader,
  StudentProfileOverview,
  StudentFeesSection,
  StudentPaymentsSection,
  StudentResultsSection,
  computeFeeSummary,
  downloadStudentMonthReceipt,
  MONTHS,
  type StudentFeeHistoryData,
  type StudentPublishedResultSummary,
} from '@/components/student-profile';

interface FeeStructureItem {
  id: number;
  fee_type_name: string;
  amount: string;
}

export default function StudentDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const { canView } = usePermissions();
  const showResults = canView('results');
  const [data, setData] = useState<StudentFeeHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingFees, setEditingFees] = useState(false);
  const [feeStructures, setFeeStructures] = useState<FeeStructureItem[]>([]);
  const [editChoices, setEditChoices] = useState<{ fee_structure_id: number; effective_from: string }[]>([]);
  const [savingFees, setSavingFees] = useState(false);
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

  useEffect(() => {
    if (editingFees && data?.student?.school_class) {
      getFeeStructures(data.student.school_class)
        .then(({ data: fsData }) => {
          const list = fsData.results || fsData;
          setFeeStructures(list);
          setEditChoices(
            (data.fee_choices || []).map((c) => ({
              fee_structure_id: c.fee_structure_id,
              effective_from: c.effective_from?.slice(0, 10) || '',
            }))
          );
        })
        .catch(() => setFeeStructures([]));
    }
  }, [editingFees, data?.student?.school_class]);

  const toggleEditChoice = (fsId: number, effectiveFrom: string) => {
    setEditChoices((prev) => {
      const exists = prev.some((c) => c.fee_structure_id === fsId);
      if (exists) return prev.filter((c) => c.fee_structure_id !== fsId);
      return [...prev, { fee_structure_id: fsId, effective_from: effectiveFrom }];
    });
  };

  const setEditEffectiveFrom = (fsId: number, date: string) => {
    setEditChoices((prev) =>
      prev.map((c) => (c.fee_structure_id === fsId ? { ...c, effective_from: date } : c))
    );
  };

  const handleSaveFeeChoices = async () => {
    if (!data?.student?.school_class) return;
    setSavingFees(true);
    try {
      await updateStudent(id, {
        fee_structure_choices: editChoices.map((c) => ({
          fee_structure_id: c.fee_structure_id,
          ...(c.effective_from && { effective_from: c.effective_from }),
        })),
      });
      const { data: newData } = await getStudentFeeHistory(id);
      setData(newData);
      setEditingFees(false);
    } catch {
      alert('Failed to update fee choices');
    } finally {
      setSavingFees(false);
    }
  };

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

  const { student, admission_date, fee_choices, yearly_payments = [], monthly_history, allow_parent_online_payment = false } = data;
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

      <div className={cn('grid gap-4', showResults ? 'lg:grid-cols-2' : '')}>
        <StudentFeesSection
          feeChoices={fee_choices}
          canEdit={!!student.school_class}
          onEdit={() => setEditingFees(true)}
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
      </div>

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

      {editingFees ? (
        <DashboardModal
          title="Edit fee types"
          subtitle='Tick fee types to charge. Use "Start from" when a fee begins mid-session.'
          wide
          onClose={() => setEditingFees(false)}
        >
          {feeStructures.length === 0 ? (
            <InlineLoading message="Loading fee structures…" />
          ) : (
            <div className="space-y-4">
              <div className="space-y-3">
                {feeStructures.map((fs) => {
                  const isSelected = editChoices.some((c) => c.fee_structure_id === fs.id);
                  const effectiveFrom =
                    editChoices.find((c) => c.fee_structure_id === fs.id)?.effective_from || '';
                  return (
                    <div key={fs.id} className="flex flex-wrap items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleEditChoice(fs.id, '')}
                          className="rounded border-white/20 bg-white/5 text-teal-500 focus:ring-teal-500/30"
                        />
                        <span className="text-sm text-slate-300">
                          {fs.fee_type_name} - ₹{parseFloat(fs.amount).toLocaleString('en-IN')}
                        </span>
                      </label>
                      {isSelected ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Start from:</span>
                          <input
                            type="date"
                            value={effectiveFrom}
                            onChange={(e) => setEditEffectiveFrom(fs.id, e.target.value)}
                            className={dash.fieldSm}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  type="button"
                  onClick={handleSaveFeeChoices}
                  disabled={savingFees || editChoices.length === 0}
                  className="rounded-xl border-0 bg-gradient-to-r from-teal-500 to-cyan-500"
                >
                  {savingFees ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingFees(false)}
                  className="rounded-xl border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DashboardModal>
      ) : null}
    </PageShell>
  );
}
