'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore, type AuthState, type AuthUser } from '@/stores/authStore';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
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
  setUser: (u: AuthUser | null) => void;
  refreshUser: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s: AuthState) => s.user);
  const loading = useAuthStore((s: AuthState) => s.loading);
  const setUser = useAuthStore((s: AuthState) => s.setUser);
  const refreshUser = useAuthStore((s: AuthState) => s.refreshUser);
  const initializeAuth = useAuthStore((s: AuthState) => s.initializeAuth);
  const loginToStore = useAuthStore((s: AuthState) => s.login);
  const parentLoginToStore = useAuthStore((s: AuthState) => s.parentLogin);
  const parentRegisterToStore = useAuthStore((s: AuthState) => s.parentRegister);
  const parentResetPasswordToStore = useAuthStore((s: AuthState) => s.parentResetPassword);
  const logoutFromStore = useAuthStore((s: AuthState) => s.logout);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const login = async (loginId: string, password: string) => {
    await loginToStore(loginId, password);
    router.push('/dashboard');
  };

  const parentLogin = async (schoolCode: string, phone: string, password: string) => {
    await parentLoginToStore(schoolCode, phone, password);
    router.push('/parent');
  };

  const parentRegister = async (data: {
    school_code: string;
    phone: string;
    otp: string;
    password: string;
    password2: string;
  }) => {
    await parentRegisterToStore(data);
    router.push('/parent');
  };

  const parentResetPassword = async (data: {
    school_code: string;
    phone: string;
    otp: string;
    password: string;
    password2: string;
  }) => {
    await parentResetPasswordToStore(data);
    router.push('/parent');
  };

  const logout = () => {
    logoutFromStore();
    router.push(pathname?.startsWith('/parent') ? '/parent/login' : '/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, parentLogin, parentRegister, parentResetPassword, logout, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
