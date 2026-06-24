import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt.js';
import { Role } from '../types/index.js';

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token lipsă sau invalid' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'Token expirat sau invalid' });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Acces interzis' });
      return;
    }
    next();
  };
}

// Middleware pentru rute accesibile elevilor
export const requireElev = requireRole(Role.ELEV);

// Middleware pentru rute accesibile antreprenorilor
export const requireAntreprenor = requireRole(Role.ANTREPRENOR);

// Middleware pentru admin
export const requireAdmin = requireRole(Role.ADMIN);
