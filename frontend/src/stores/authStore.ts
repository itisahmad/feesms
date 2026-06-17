'use client';

import { create } from 'zustand';
import { getMe, login as apiLogin, parentLogin as apiParentLogin, parentRegister as apiParentRegister, parentResetPassword as apiParentResetPassword } from '@/lib/api';
import type { ModulePermissions } from '@/lib/staff-modules';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone: string;
  school: number | null;
  school_name: string;
  school_plan?: 'basic' | 'standard' | 'premium';
  trial_ends_at?: string | null;
  plan_period_end?: string | null;
  subscription_blocked?: boolean;
  is_owner?: boolean;
  module_permissions?: ModulePermissions;
  allowed_modules?: string[];
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  refreshUser: () => Promise<AuthUser | null>;
  initializeAuth: () => Promise<void>;
  login: (loginId: string, password: string) => Promise<void>;
  parentLogin: (schoolCode: string, phone: string, password: string) => Promise<void>;
  parentRegister: (data: {
    school_code: string;
    phone: string;
    otp: string;
    password: string;
    password2: string;
  }) => Promise<void>;
  parentResetPassword: (data: {
    school_code: string;
    phone: string;
    otp: string;
    password: string;
    password2: string;
  }) => Promise<void>;
  logout: () => void;
}

const clearAuthTokens = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('access');
  localStorage.removeItem('refresh');
};

export const useAuthStore = create<AuthState>((set: (partial: Partial<AuthState>) => void) => ({
  user: null,
  loading: true,

  setUser: (user: AuthUser | null) => set({ user }),

  refreshUser: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access') : null;
    if (!token) {
      set({ user: null });
      return null;
    }
    try {
      const { data } = await getMe();
      set({ user: data });
      return data;
    } catch {
      clearAuthTokens();
      set({ user: null });
      return null;
    }
  },

  initializeAuth: async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access') : null;
    if (!token) {
      set({ loading: false, user: null });
      return;
    }

    try {
      const { data } = await getMe();
      set({ user: data, loading: false });
    } catch {
      clearAuthTokens();
      set({ user: null, loading: false });
    }
  },

  login: async (loginId: string, password: string) => {
    const { data } = await apiLogin(loginId, password);
    if (typeof window !== 'undefined') {
      localStorage.setItem('access', data.access);
      localStorage.setItem('refresh', data.refresh);
    }
    const { data: userData } = await getMe();
    set({ user: userData });
  },

  parentLogin: async (schoolCode: string, phone: string, password: string) => {
    const { data } = await apiParentLogin(schoolCode.trim(), phone, password);
    if (typeof window !== 'undefined') {
      localStorage.setItem('access', data.access);
      localStorage.setItem('refresh', data.refresh);
    }
    const { data: userData } = await getMe();
    set({ user: userData });
  },

  parentRegister: async (payload) => {
    const { data } = await apiParentRegister(payload);
    if (typeof window !== 'undefined') {
      localStorage.setItem('access', data.access);
      localStorage.setItem('refresh', data.refresh);
    }
    const { data: userData } = await getMe();
    set({ user: userData });
  },

  parentResetPassword: async (payload) => {
    const { data } = await apiParentResetPassword(payload);
    if (typeof window !== 'undefined') {
      localStorage.setItem('access', data.access);
      localStorage.setItem('refresh', data.refresh);
    }
    const { data: userData } = await getMe();
    set({ user: userData });
  },

  logout: () => {
    clearAuthTokens();
    set({ user: null });
  },
}));
