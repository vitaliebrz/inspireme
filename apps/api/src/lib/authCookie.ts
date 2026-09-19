import type { Response } from 'express';

// ─────────────────────────────────────────────
// COOKIE REFRESH TOKEN (httpOnly) — nu poate fi citit din JavaScript, deci imun
// la furt prin XSS (spre deosebire de localStorage). Trimis doar pe rutele /auth.
// ─────────────────────────────────────────────

export const REFRESH_COOKIE_NAME = 'refreshToken';

const isProd = process.env['NODE_ENV'] === 'production';
const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 zile (cât refresh token-ul)

// În prod, dacă frontend-ul și API-ul sunt pe domenii diferite, cookie-ul cross-site
// necesită SameSite=None + Secure. În dev (localhost) folosim Lax + non-secure.
const cookieBase = {
  httpOnly: true as const,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/api/v1/auth',
};

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieBase, maxAge: MAX_AGE });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieBase);
}
