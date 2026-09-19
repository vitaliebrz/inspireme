import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { api, setAccessToken, refreshAccessToken } from '../lib/api';

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
  authReady: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  refetchUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// `user` rămâne cache de UI în localStorage (nu e sensibil — sunt datele lui proprii),
// ca UI-ul să se randeze instant. Token-urile NU mai sunt în localStorage.
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
  // authReady = false până când s-a încercat obținerea unui access token la boot
  // (prin cookie-ul de refresh). Socket-ul așteaptă acest semnal ca să aibă token.
  const [authReady, setAuthReady] = useState(false);

  // La încărcarea aplicației: access token-ul (din memorie) e pierdut. Dacă avem un
  // user în cache, cerem un access token nou prin cookie-ul httpOnly de refresh.
  useEffect(() => {
    if (!loadUser()) { setAuthReady(true); return; }
    let cancelled = false;
    refreshAccessToken()
      .catch(() => {
        // Refresh invalid/expirat → sesiune încheiată
        if (!cancelled) { localStorage.removeItem('user'); setUser(null); }
      })
      .finally(() => { if (!cancelled) setAuthReady(true); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const { data } = await api.post<{ accessToken: string; user: AuthUser }>(
      '/auth/login',
      { email, password },
    );
    setAccessToken(data.accessToken);       // în memorie
    localStorage.setItem('user', JSON.stringify(data.user)); // cache UI
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.post('/auth/logout'); // șterge cookie-ul + invalidează refresh token-ul pe server
    } catch {
      // Ignorăm erorile la logout — curățăm oricum
    }
    setAccessToken(null);
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

  // Recitește userul curent din DB (nu din cache) — necesar după evenimente care
  // schimbă planul/rolul din afara aplicației (ex. checkout Stripe), altfel utilizatorul
  // ar vedea planul vechi peste tot în afară de /subscriptions, până la logout/login.
  const refetchUser = useCallback(async (): Promise<void> => {
    try {
      const { data } = await api.get<AuthUser>('/auth/me');
      localStorage.setItem('user', JSON.stringify(data));
      setUser(data);
    } catch {
      // Ignorăm — dacă tokenul e invalid, interceptorul de axios gestionează deja logout-ul
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, authReady, login, logout, updateUser, refetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth trebuie folosit în AuthProvider');
  return ctx;
}
