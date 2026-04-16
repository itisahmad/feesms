import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://feesms-be79.vercel.app/api';

export const api = axios.create({
  baseURL: API_URL,
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
          const { data } = await axios.post(`${API_URL}/token/refresh/`, { refresh });
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
export const createStaffUser = (data: {
  username: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role: 'accountant' | 'staff';
  password: string;
  password2: string;
}) => api.post('/staff-users/', data);
export const updateStaffUser = (id: number, data: {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: 'accountant' | 'staff';
  is_active?: boolean;
}) => api.patch(`/staff-users/${id}/`, data);
export const deleteStaffUser = (id: number) => api.delete(`/staff-users/${id}/`);

// Schools
export const getSchool = () => api.get('/schools/');
export const updateSchool = (id: number, data: object) => api.patch(`/schools/${id}/`, data);

// Classes
export const getClasses = () => api.get('/classes/');
export const createClass = (data: { name: string; display_order?: number; section_names?: string[] }) =>
  api.post('/classes/', data);
export const addSection = (classId: number, name: string) =>
  api.post(`/classes/${classId}/add_section/`, { name });
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

// Fee types
export const getFeeTypes = () => api.get('/fee-types/');
export const createFeeType = (data: { name: string; description?: string; billing_period?: string }) =>
  api.post('/fee-types/', data);
export const updateFeeType = (id: number, data: { name?: string; description?: string }) =>
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
export const payAllPending = (data: {
  student_id: number;
  month: number;
  year: number;
  payment_date: string;
  payment_mode?: string;
  notes?: string;
  only_this_month?: boolean;
  fee_structure_ids?: number[];
}) => api.post('/student-fees/pay_all_pending/', data);
export const payAllYear = (data: {
  student_id: number;
  month: number;
  year: number;
  payment_date: string;
  payment_mode?: string;
  notes?: string;
  fee_structure_ids?: number[];
}) => api.post('/student-fees/pay_all_year/', data);
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
