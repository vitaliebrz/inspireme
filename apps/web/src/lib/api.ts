import axios from 'axios';

const DEFAULT_API_URL = 'http://localhost:4000/api/v1';
const BASE_URL = import.meta.env['VITE_API_URL'] ?? (
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000/api/v1`
    : DEFAULT_API_URL
);

// ─────────────────────────────────────────────
// ACCESS TOKEN — ținut DOAR în memorie (nu în localStorage) → imun la furt prin XSS.
// Refresh token-ul stă într-un cookie httpOnly (invizibil pentru JavaScript), trimis
// automat de browser pe /auth/refresh (withCredentials).
// ─────────────────────────────────────────────
let accessToken: string | null = null;
export function setAccessToken(token: string | null): void { accessToken = token; }
export function getAccessToken(): string | null { return accessToken; }

// withCredentials → trimite cookie-ul httpOnly de refresh către API
export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

// Atașează access token (din memorie) la fiecare request.
// Dacă datele sunt FormData, ștergem Content-Type ca browser-ul să seteze boundary-ul corect.
api.interceptors.request.use((config) => {
  if (accessToken) config.headers['Authorization'] = `Bearer ${accessToken}`;
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Refresh cu single-flight: mai multe 401-uri simultane declanșează UN singur refresh
// (altfel rotația refresh token-ului s-ar invalida reciproc).
let refreshPromise: Promise<string> | null = null;
export function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post<{ accessToken: string }>(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true })
      .then(({ data }) => { setAccessToken(data.accessToken); return data.accessToken; })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

// La 401 → încearcă refresh (prin cookie), reia cererea; dacă eșuează → logout.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        const token = await refreshAccessToken();
        original.headers['Authorization'] = `Bearer ${token}`;
        return api(original);
      } catch {
        setAccessToken(null);
        localStorage.removeItem('user');
        if (window.location.pathname !== '/login') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
