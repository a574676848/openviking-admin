'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';
import { clearSessionToken, readSessionToken, writeSessionToken } from '../lib/session';

interface User {
  id: string;
  username: string;
  role: string;
  tenantId: string | null;
}

export type ThemeType = "neo" | "swiss";

interface AppState {
  user: User | null;
  isLoading: boolean;
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
  login: (token: string, userData: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AppContext = createContext<AppState | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const normalizeTheme = (value: string | null): ThemeType => {
    return value === 'swiss' ? 'swiss' : 'neo';
  };
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setThemeState] = useState<ThemeType>(() => {
    if (typeof window === 'undefined') {
      return 'neo';
    }
    return normalizeTheme(localStorage.getItem('ov_theme'));
  });

  const setTheme = (newTheme: ThemeType) => {
    setThemeState(newTheme);
    localStorage.setItem("ov_theme", newTheme);
    applyTheme(newTheme);
  };

  const applyTheme = (t: ThemeType) => {
    const root = document.documentElement;
    root.setAttribute("data-theme", "neo");
    if (t === "swiss") {
      root.classList.add("theme-swiss");
    } else {
      root.classList.remove("theme-swiss");
    }
  };

  const login = (token: string, userData: User) => {
    writeSessionToken(token);
    setUser(userData);
  };

  const logout = () => {
    clearSessionToken();
    setUser(null);
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    try {
      const data = await apiClient.get<User>('/auth/me');
      setUser(data);
    } catch (err) {
      console.error('Failed to fetch user', err);
      // 如果 401，apiClient 会自动处理
    }
  };

  useEffect(() => {
    const token = readSessionToken();
    applyTheme(theme);

    if (token) {
      // 从 token 解析或重新获取
      queueMicrotask(() => {
        void refreshUser().finally(() => setIsLoading(false));
      });
    } else {
      queueMicrotask(() => {
        setIsLoading(false);
      });
    }
  }, [theme]);

  return (
    <AppContext.Provider value={{ user, isLoading, theme, setTheme, login, logout, refreshUser }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
