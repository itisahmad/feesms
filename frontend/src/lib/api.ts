import axios from 'axios';
import { API_BASE_URL, buildApiUrl } from './env';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh');
      if (refresh) {
        try {
          const { data } = await axios.post(buildApiUrl('/token/refresh/'), { refresh });
          localStorage.setItem('access', data.access);
          original.headers.Authorization = `Bearer ${data.access}`;
          return api(original);
        } catch (_) {
          localStorage.removeItem('access');
          localStorage.removeItem('refresh');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const register = (data: {
  username: string;
  email: string;
  password: string;
  password2: string;
  first_name: string;
  last_name: string;
  phone?: string;
  school_name: string;
  school_city?: string;
  school_phone?: string;
}) => api.post('/auth/register/', data);

export const login = (username: string, password: string) =>
  api.post('/token/', { username, password });

export const getMe = () => api.get('/auth/me/');
export const forgotPassword = (username_or_email: string) =>
  api.post('/auth/forgot-password/', { username_or_email });
export const resetPassword = (data: { uid: string; token: string; password: string; password2: string }) =>
  api.post('/auth/reset-password/', data);

// Staff users
export const getStaffUsers = () => api.get('/staff-users/');
export const getStaffModuleDefinitions = () => api.get('/staff-users/module-definitions/');
export const createStaffUser = (data: {
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  password: string;
  password2: string;
  module_permissions?: Record<string, Record<string, boolean>>;
}) => api.post('/staff-users/', data);
export const updateStaffUser = (id: number, data: {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  is_active?: boolean;
  module_permissions?: Record<string, Record<string, boolean>>;
}) => api.patch(`/staff-users/${id}/`, data);
export const deleteStaffUser = (id: number) => api.delete(`/staff-users/${id}/`);

// Schools
export type SchoolRecord = {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  logo: string | null;
  logo_url?: string | null;
  plan?: string;
  max_students?: number;
  max_staff_logins?: number;
  academic_year_start_month: number;
  fee_start_day?: number;
  trial_ends_at?: string | null;
  created_at?: string;
};

export const getSchool = () => api.get('/schools/');
export const updateSchool = (id: number, data: FormData | Record<string, unknown>) =>
  api.patch<SchoolRecord>(`/schools/${id}/`, data);
export const upgradeSchoolPlan = (id: number, plan: 'basic' | 'standard' | 'premium') =>
  api.post(`/schools/${id}/upgrade_plan/`, { plan });

// Classes
export const getClasses = () => api.get('/classes/');
export const createClass = (data: { name: string; display_order?: number; section_names?: string[] }) =>
  api.post('/classes/', data);
export const addSection = (classId: number, name: string) =>
  api.post(`/classes/${classId}/add_section/`, { name });
export const addSubject = (classId: number, name: string) =>
  api.post(`/classes/${classId}/add_subject/`, { name });
export const removeSubject = (classId: number, subjectId: number) =>
  api.post(`/classes/${classId}/remove_subject/`, { subject_id: subjectId });
export const applyFeeToClass = (classId: number, data: { fee_structure_id: number; effective_from?: string }) =>
  api.post(`/classes/${classId}/apply_fee/`, data);
export const updateClass = (id: number, data: object) => api.patch(`/classes/${id}/`, data);
export const deleteClass = (id: number) => api.delete(`/classes/${id}/`);

// Students
export const getStudents = (params?: { class?: number; section?: number; search?: string }) =>
  api.get('/students/', { params });
export const createStudent = (data: object) => api.post('/students/', data);
export const updateStudent = (id: number, data: object) => api.patch(`/students/${id}/`, data);
export const deleteStudent = (id: number) => api.delete(`/students/${id}/`);
export const getStudentFeeHistory = (studentId: number) => api.get(`/students/${studentId}/fee_history/`);

// Admission enquiries
export const getEnquiries = (params?: {
  status?: string;
  class?: number;
  search?: string;
  follow_up_due?: 'today';
}) => api.get('/enquiries/', { params });
export const getEnquiryStats = () => api.get('/enquiries/stats/');
export const createEnquiry = (data: object) => api.post('/enquiries/', data);
export const updateEnquiry = (id: number, data: object) => api.patch(`/enquiries/${id}/`, data);
export const deleteEnquiry = (id: number) => api.delete(`/enquiries/${id}/`);

// Fee types
export const getFeeTypes = () => api.get('/fee-types/');
export const createFeeType = (data: { name: string; description?: string; billing_period?: string }) =>
  api.post('/fee-types/', data);
export const updateFeeType = (id: number, data: { name?: string; description?: string; billing_period?: string }) =>
  api.patch(`/fee-types/${id}/`, data);
export const deleteFeeType = (id: number) => api.delete(`/fee-types/${id}/`);

// Fee structures
export const getFeeStructures = (schoolClassId?: number) =>
  api.get('/fee-structures/', { params: schoolClassId ? { school_class: schoolClassId } : {} });
export const createFeeStructure = (data: object) => api.post('/fee-structures/', data);
export const updateFeeStructure = (id: number, data: object) =>
  api.patch(`/fee-structures/${id}/`, data);
export const deleteFeeStructure = (id: number) => api.delete(`/fee-structures/${id}/`);

// Student fees
export const getStudentFees = (params?: { student?: number; month?: number; year?: number }) =>
  api.get('/student-fees/', { params });
export const createStudentFee = (data: object) => api.post('/student-fees/', data);
export const addPayment = (studentFeeId: number, data: {
  amount: number;
  payment_date: string;
  payment_mode?: string;
  transaction_id?: string;
  notes?: string;
}) => api.post(`/student-fees/${studentFeeId}/add_payment/`, data);
export const payFullYear = (data: {
  student_id: number;
  fee_structure_id: number;
  payment_date: string;
  payment_mode?: string;
  notes?: string;
}) => api.post('/student-fees/pay_full_year/', data);
export type FeePaymentAdjustment = {
  adjustment_type?: 'add' | 'subtract';
  adjustment_amount?: number;
  adjustment_notes?: string;
};

export const payAllPending = (data: {
  student_id: number;
  month: number;
  year: number;
  payment_date: string;
  payment_mode?: string;
  notes?: string;
  only_this_month?: boolean;
  fee_structure_ids?: number[];
} & FeePaymentAdjustment) => api.post('/student-fees/pay_all_pending/', data);
export const payAllYear = (data: {
  student_id: number;
  month: number;
  year: number;
  payment_date: string;
  payment_mode?: string;
  notes?: string;
  fee_structure_ids?: number[];
} & FeePaymentAdjustment) => api.post('/student-fees/pay_all_year/', data);
export const getPaymentPreview = (studentId: number, month: number, year: number, feeStructureIds?: number[]) =>
  api.get('/student-fees/payment_preview/', {
    params: {
      student_id: studentId,
      month,
      year,
      ...(feeStructureIds && { fee_structure_ids: feeStructureIds.join(',') }),
    },
  });
export const getReceipt = (studentFeeId: number) =>
  api.get(`/student-fees/${studentFeeId}/receipt/`, { responseType: 'blob' });
export const getDashboard = () => api.get('/student-fees/dashboard/');
export const getCollectionSummary = (month: number, year: number, cacheBust?: boolean) =>
  api.get('/student-fees/collection_summary/', {
    params: cacheBust ? { month, year, _: Date.now() } : { month, year },
  });
export const generateFees = (month: number, year: number) =>
  api.post('/student-fees/generate_fees/', { month, year });
export const sendReminder = (channel: 'whatsapp' | 'sms' | 'both' = 'both') =>
  api.post('/student-fees/send_reminder/', { channel });

// Expense Management APIs
export const getExpenseCategories = () => api.get('/expense-categories/');
export const createExpenseCategory = (data: any) => api.post('/expense-categories/', data);
export const updateExpenseCategory = (id: number, data: any) => api.patch(`/expense-categories/${id}/`, data);
export const deleteExpenseCategory = (id: number) => api.delete(`/expense-categories/${id}/`);

export const getVendors = () => api.get('/vendors/');
export const createVendor = (data: any) => api.post('/vendors/', data);
export const updateVendor = (id: number, data: any) => api.patch(`/vendors/${id}/`, data);
export const deleteVendor = (id: number) => api.delete(`/vendors/${id}/`);

export const getExpenses = (params?: any) => api.get('/expenses/', { params });
export const createExpense = (data: any) => api.post('/expenses/', data);
export const updateExpense = (id: number, data: any) => api.patch(`/expenses/${id}/`, data);
export const deleteExpense = (id: number) => api.delete(`/expenses/${id}/`);
export const getExpenseReports = (params?: any) => api.get('/expenses/reports/', { params });

export const getBudgets = () => api.get('/budgets/');
export const createBudget = (data: any) => api.post('/budgets/', data);
export const updateBudget = (id: number, data: any) => api.patch(`/budgets/${id}/`, data);
export const deleteBudget = (id: number) => api.delete(`/budgets/${id}/`);

// Booking APIs
export const checkMaintenance = () => api.get('/maintenance/');
export const getBookingSlots = () => api.get('/booking/slots/');
export const bookSlot = (data: { date: string; time: string }) => api.post('/booking/book/', data);

// Payments module
export const getPaymentConfig = () => api.get('/payments/config/');
export const updatePaymentConfig = (data: { platform_billing_cycle?: 'monthly' | 'yearly'; razorpay_route_account_id?: string; active?: boolean }) =>
  api.patch('/payments/config/', data);
export const getPlatformBillingSummary = () => api.get('/payments/platform/summary/');
export const createPlatformOrder = (billing_cycle: 'monthly' | 'yearly') =>
  api.post('/payments/platform/create-order/', { billing_cycle });
export const verifyPlatformPayment = (data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
  api.post('/payments/platform/verify/', data);
export const createParentPaymentIntent = (data: { student_fee_id: number; amount: number; notes?: string }) =>
  api.post('/payments/parent/create-intent/', data);
export const verifyParentPayment = (data: {
  intent_id: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  payment_mode?: string;
}) => api.post('/payments/parent/verify/', data);

export const createFeeCollectionOrder = (data: {
  student_id: number;
  month: number;
  year: number;
  payment_date: string;
  collection_mode: 'monthly' | 'yearly' | 'all_pending';
  fee_structure_ids?: number[];
  notes?: string;
} & FeePaymentAdjustment) => api.post('/payments/fee-collection/create-order/', data);

export const verifyFeeCollectionPayment = (data: {
  checkout_session_id: number;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}) => api.post('/payments/fee-collection/verify/', data);

// Receipt template designer
export type ReceiptTemplateMeta = {
  key: string;
  name: string;
  description: string;
  supports_a4: boolean;
  supports_thermal: boolean;
};

export type ReceiptSettingsPayload = {
  template_key: string;
  print_format: 'a4' | 'thermal';
  school_name: string;
  address: string;
  phone: string;
  email: string;
  header_color: string;
  footer_text: string;
  signature_label: string;
  stamp_text: string;
  show_logo: boolean;
  updated_at?: string;
};

export const getReceiptTemplates = () => api.get<ReceiptTemplateMeta[]>('/receipts/templates/');
export const getReceiptSettings = () => api.get<ReceiptSettingsPayload>('/receipts/settings/');
export const updateReceiptSettings = (data: Partial<ReceiptSettingsPayload>) =>
  api.patch<ReceiptSettingsPayload>('/receipts/settings/', data);
export const previewReceiptPdf = (data?: Partial<ReceiptSettingsPayload>) =>
  api.post('/receipts/preview/', data ?? {}, { responseType: 'blob' });

export const generateReceiptPdf = (data: {
  student_id?: number;
  student_fee_id?: number;
  receipt_type?: 'monthly' | 'yearly';
  month?: number;
  year?: number;
  template_key?: string;
  print_format?: 'a4' | 'thermal';
}) => api.post('/receipts/generate/', data, { responseType: 'blob' });

// Exam results
export type ExamResultListItem = {
  id: number;
  name: string;
  school_class: number;
  class_name: string;
  exam_date: string | null;
  max_marks: string;
  status: 'draft' | 'published';
  marks_count: number;
  students_count: number;
  created_at: string;
  updated_at: string;
};

export type ExamMarksheetSubject = {
  id: number;
  name: string;
  display_order: number;
};

export type ExamMarksheetCell = {
  mark_id: number | null;
  class_subject_id: number;
  marks_obtained: string | null;
  max_marks: string;
  is_absent: boolean;
  grade: string;
  remarks: string;
};

export type ExamMarksheetStudent = {
  student_id: number;
  student_name: string;
  roll_number: string;
  admission_number: string;
  class_name: string;
  marks: ExamMarksheetCell[];
  total_obtained: string | null;
  total_max: string | null;
  percentage: number | null;
  overall_grade: string;
};

export type ExamMarksheetResponse = {
  exam: ExamResultListItem;
  subjects: ExamMarksheetSubject[];
  students: ExamMarksheetStudent[];
  has_subjects: boolean;
  has_students: boolean;
};

export type BulkMarkEntry = {
  student_id: number;
  class_subject_id: number;
  marks_obtained?: number | string | null;
  is_absent?: boolean;
  remarks?: string;
};

export const getExams = (params?: { school_class?: number; status?: string }) =>
  api.get<{ results?: ExamResultListItem[] } | ExamResultListItem[]>('/results/exams/', { params });

export const createExam = (data: {
  name: string;
  school_class: number;
  exam_date?: string | null;
  max_marks?: number | string;
}) => api.post<ExamResultListItem>('/results/exams/', data);

export const deleteExam = (id: number) => api.delete(`/results/exams/${id}/`);

export const getExamMarksheet = (id: number) =>
  api.get<ExamMarksheetResponse>(`/results/exams/${id}/marksheet/`);

export const initializeExamMarks = (id: number) =>
  api.post<{ created: number; message: string }>(`/results/exams/${id}/initialize_marks/`);

export const saveExamMarks = (id: number, marks: BulkMarkEntry[]) =>
  api.post<{ updated: number }>(`/results/exams/${id}/save_marks/`, { marks });

export const publishExam = (id: number) =>
  api.post<ExamResultListItem>(`/results/exams/${id}/publish/`);

export const unpublishExam = (id: number) =>
  api.post<ExamResultListItem>(`/results/exams/${id}/unpublish/`);

export type StudentPublishedResultSummary = {
  exam_id: number;
  exam_name: string;
  exam_date: string | null;
  class_name: string;
  max_marks: string;
  total_obtained: string | null;
  total_max: string | null;
  percentage: number | null;
  overall_grade: string;
};

export type StudentPublishedResultsResponse = {
  student_id: number;
  student_name: string;
  class_name: string;
  results: StudentPublishedResultSummary[];
};

export type StudentExamReportResponse = {
  exam: {
    id: number;
    name: string;
    exam_date: string | null;
    max_marks: string;
    status: string;
    class_name: string;
  };
  student: {
    id: number;
    name: string;
    roll_number: string;
    class_name: string;
  };
  subjects: ExamMarksheetSubject[];
  marks: ExamMarksheetCell[];
  total_obtained: string | null;
  total_max: string | null;
  percentage: number | null;
  overall_grade: string;
};

export const getStudentPublishedResults = (studentId: number) =>
  api.get<StudentPublishedResultsResponse>(`/results/students/${studentId}/published/`);

export const getStudentExamReport = (examId: number, studentId: number) =>
  api.get<StudentExamReportResponse>(`/results/exams/${examId}/student_report/`, {
    params: { student_id: studentId },
  });

export type GradingBand = {
  grade: string;
  min_percentage: number;
};

export type GradingSettingsPayload = {
  absent_grade: string;
  bands: GradingBand[];
  default_bands: GradingBand[];
  updated_at?: string;
};

export const getGradingSettings = () =>
  api.get<GradingSettingsPayload>('/results/grading-settings/');

export const updateGradingSettings = (
  data: Partial<Pick<GradingSettingsPayload, 'absent_grade' | 'bands'>> & { recalculate_draft?: boolean },
) => api.patch<GradingSettingsPayload & { marks_recalculated?: number }>('/results/grading-settings/', data);
