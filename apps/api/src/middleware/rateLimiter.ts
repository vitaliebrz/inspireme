import { Request, Response, NextFunction } from 'express';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../lib/redis.js';

// Sliding window — 100 req / 15 min per IP
const generalRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, '15 m'),
  prefix: 'rl:general',
});

// Sliding window — 5 req / 15 min pe autentificare
const authRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  prefix: 'rl:auth',
});

// Fixed window — 10 req / min pentru upload
const uploadRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.fixedWindow(10, '1 m'),
  prefix: 'rl:upload',
});

// Sliding window — 10 încercări / 15 min per CONT (email), independent de IP.
// Protejează contra brute-force distribuit pe multe IP-uri (botnet, proxy-uri rotative).
const accountRatelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '15 m'),
  prefix: 'rl:account',
});

// req.ip respectă 'trust proxy' (TRUST_PROXY_HOPS în index.ts): ia IP-ul adăugat de
// ultimul proxy de încredere, nu prima valoare din X-Forwarded-For — aceea e trimisă
// de client și poate fi falsificată ca să ocolească limita.
const ipKey = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'unknown';

const emailKey = (req: Request): string | null => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
};

function makeMiddleware(limiter: Ratelimit, getKey: (req: Request) => string | null = ipKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env['NODE_ENV'] !== 'production') { next(); return; }
    const key = getKey(req);
    if (!key) { next(); return; }
    try {
      const { success, limit, remaining, reset } = await limiter.limit(key);
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', reset);

      if (!success) {
        res.status(429).json({ error: 'Prea multe cereri. Încearcă din nou mai târziu.' });
        return;
      }
      next();
    } catch {
      // Dacă Redis e indisponibil, lasă requestul să treacă (fail open în dev)
      if (process.env['NODE_ENV'] === 'production') {
        res.status(503).json({ error: 'Serviciu temporar indisponibil.' });
        return;
      }
      next();
    }
  };
}

export const generalLimiter = makeMiddleware(generalRatelimit);
export const authLimiter = makeMiddleware(authRatelimit);
export const uploadLimiter = makeMiddleware(uploadRatelimit);
export const accountLimiter = makeMiddleware(accountRatelimit, emailKey);
