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

function getIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket.remoteAddress ??
    'unknown'
  );
}

function makeMiddleware(limiter: Ratelimit) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (process.env['NODE_ENV'] !== 'production') { next(); return; }
    try {
      const { success, limit, remaining, reset } = await limiter.limit(getIp(req));
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
