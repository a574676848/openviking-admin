'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import { destroySession, readSessionToken, readSessionUser, writeSessionToken, writeSessionUser } from '../lib/session';

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

/** 结构化日志通道，生产环境可替换为外部监控服务 */
function log(level: 'info' | 'warn' | 'error', message: string, detail?: unknown) {
  if (process.env.NODE_ENV === 'development') {
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(`[AppProvider] ${message}`, detail ?? '');
    return;
  }
  // 生产环境：收敛到统一日志端点
  try {
    navigator.sendBeacon?.('/api/v1/audit/client-log', JSON.stringify({ level, message, detail, ts: Date.now() }));
  } catch {
    // 静默失败，不阻塞用户操作
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const normalizeTheme = (value: string | null): ThemeType => {
    return value === 'swiss' ? 'swiss' : 'neo';
  };
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return readSessionUser();
  });
  const [isLoading, setIsLoading] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }
    return readSessionToken() !== null && readSessionUser() === null;
  });
  const [theme, setThemeState] = useState<ThemeType>(() => {
    if (typeof window === 'undefined') {
      return 'neo';
    }
    return normalizeTheme(localStorage.getItem('ov_theme'));
  });

  const setTheme = useCallback((newTheme: ThemeType) => {
    setThemeState(newTheme);
    localStorage.setItem("ov_theme", newTheme);
    const root = document.documentElement;
    root.setAttribute("data-theme", "neo");
    if (newTheme === "swiss") {
      root.classList.add("theme-swiss");
    } else {
      root.classList.remove("theme-swiss");
    }
  }, []);

  const login = useCallback((token: string, userData: User) => {
    writeSessionToken(token);
    writeSessionUser(userData);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    destroySession();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiClient.get<User>('/auth/me');
      writeSessionUser(data);
      setUser(data);
    } catch (err) {
      log('error', 'Failed to fetch user', err instanceof Error ? err.message : err);
    }
  }, []);

  useEffect(() => {
    const token = readSessionToken();
    const root = document.documentElement;
    root.setAttribute("data-theme", "neo");
    if (theme === "swiss") {
      root.classList.add("theme-swiss");
    } else {
      root.classList.remove("theme-swiss");
    }

    if (token) {
      const cachedUser = readSessionUser();
      if (cachedUser) {
        setUser(cachedUser);
        queueMicrotask(() => {
          void refreshUser();
        });
        setIsLoading(false);
        return;
      }
      queueMicrotask(() => {
        void refreshUser().finally(() => setIsLoading(false));
      });
    } else {
      queueMicrotask(() => {
        setIsLoading(false);
      });
    }
  }, [theme, refreshUser]);

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
