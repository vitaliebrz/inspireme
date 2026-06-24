import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types/index.js';

const ACCESS_SECRET = process.env['JWT_ACCESS_SECRET'] ?? '';
const REFRESH_SECRET = process.env['JWT_REFRESH_SECRET'] ?? '';

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET și JWT_REFRESH_SECRET sunt obligatorii în .env');
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' });
}

export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
