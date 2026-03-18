'use client';

import { create } from 'zustand';
import { getMe, login as apiLogin } from '@/lib/api';

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
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  initializeAuth: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
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

  login: async (username: string, password: string) => {
    const { data } = await apiLogin(username, password);
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
