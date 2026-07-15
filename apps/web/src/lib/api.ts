import axios from 'axios';

const DEFAULT_API_URL = 'http://localhost:4000/api/v1';
const BASE_URL = import.meta.env['VITE_API_URL'] ?? (
  typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:4000/api/v1`
    : DEFAULT_API_URL
);

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Atașează access token la fiecare request
// Dacă datele sunt FormData, ștergem Content-Type ca browser-ul să seteze boundary-ul corect
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Dacă primim 401 → încearcă refresh, dacă eșuează → logout
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      // Fără refresh token = utilizator neautentificat pe pagină publică — nu redirectăm
      if (!refreshToken) return Promise.reject(error);
      try {
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        original.headers['Authorization'] = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
