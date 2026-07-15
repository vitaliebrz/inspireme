import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { api } from '../lib/api';

export type Role = 'ELEV' | 'ANTREPRENOR' | 'ADMIN';
export type Plan = 'GRATUIT' | 'PRO';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  firstLogin: boolean;
  avatarUrl: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const { data } = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/auth/login',
      { email, password },
    );
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Ignorăm erorile la logout — curățăm oricum
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<AuthUser>): void => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth trebuie folosit în AuthProvider');
  return ctx;
}
