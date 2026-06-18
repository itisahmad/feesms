import type { StudentPublishedResultSummary, ParentAttendanceSummary } from '@/lib/api';

export type StudentProfileStudent = {
  id: number;
  name: string;
  class_name: string;
  school_class: number | null;
  section: number | null;
  admission_date: string | null;
  charges_effective_from?: string | null;
  admission_number?: string;
  roll_number?: string;
  parent_name?: string;
  parent_phone: string;
  parent_email?: string;
  class_whatsapp_group_name?: string;
  class_whatsapp_group_link?: string;
};

export type StudentFeeChoice = {
  fee_structure_id: number;
  fee_type: string;
  amount: number;
  effective_from: string | null;
};

export type StudentFeePayment = {
  amount: number;
  date: string;
  mode: string;
  notes?: string;
  is_yearly?: boolean;
};

export type StudentMonthlyFee = {
  id: number;
  fee_type: string;
  total: number;
  paid: number;
  balance: number;
  amount?: number;
  late_fine?: number;
  status?: 'paid' | 'partial' | 'unpaid';
  is_payable?: boolean;
  can_download_receipt?: boolean;
  payments: StudentFeePayment[];
};

export type StudentMonthlyHistory = {
  year: number;
  month: number;
  fees: StudentMonthlyFee[];
  total_due: number;
  total_paid: number;
  is_current?: boolean;
  is_future?: boolean;
  is_past?: boolean;
  can_pay?: boolean;
  can_download_month_receipt?: boolean;
};

export type StudentYearlyPayment = {
  fee_type: string;
  total: number;
  date: string;
  mode: string;
};

export type StudentFeeHistoryData = {
  student: StudentProfileStudent;
  admission_date: string | null;
  months_with_fees: number;
  current_month?: number;
  current_year?: number;
  fee_choices: StudentFeeChoice[];
  yearly_payments?: StudentYearlyPayment[];
  monthly_history: StudentMonthlyHistory[];
  allow_parent_online_payment?: boolean;
};

export type StudentFeeSummary = {
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  monthsWithFees: number;
};

export type { StudentPublishedResultSummary };

export type ParentChildProfile = StudentFeeHistoryData & {
  allow_parent_online_payment?: boolean;
  published_results: StudentPublishedResultSummary[];
  attendance_summary?: ParentAttendanceSummary | null;
};
