'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, type AuthState, type AuthUser } from '@/stores/authStore';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  login: (loginId: string, password: string) => Promise<void>;
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
  const logoutFromStore = useAuthStore((s: AuthState) => s.logout);
  const router = useRouter();

  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  const login = async (loginId: string, password: string) => {
    await loginToStore(loginId, password);
    router.push('/');
  };

  const logout = () => {
    logoutFromStore();
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
