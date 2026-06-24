import { Router, Request, Response, raw } from 'express';
import { body } from 'express-validator';
import { Role } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  createCheckoutSession, createBillingPortalSession,
  getSubscriptionStatus, handleStripeWebhook,
} from '../services/subscriptions.service.js';

const router = Router();

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// ─────────────────────────────────────────────
// WEBHOOK STRIPE — fără autentificare, payload raw
// ─────────────────────────────────────────────
router.post(
  '/webhook',
  raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const signature = req.headers['stripe-signature'] as string;
    try {
      const result = await handleStripeWebhook(req.body as Buffer, signature);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// Toate rutele de mai jos necesită autentificare
router.use(authenticate);
router.use(generalLimiter);

// ─────────────────────────────────────────────
// GET /subscriptions/status
// ─────────────────────────────────────────────
router.get('/status', async (req: Request, res: Response) => {
  try {
    const status = await getSubscriptionStatus(req.user!.sub);
    res.json(status);
  } catch (err) { handleError(err, res); }
});

// ─────────────────────────────────────────────
// POST /subscriptions/checkout — creare sesiune Stripe Checkout
// ─────────────────────────────────────────────
router.post(
  '/checkout',
  [body('interval').isIn(['month', 'year'])],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { interval } = req.body as { interval: 'month' | 'year' };
      const result = await createCheckoutSession(req.user!.sub, req.user!.role as Role, interval);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /subscriptions/portal — portal billing Stripe
// ─────────────────────────────────────────────
router.post('/portal', async (req: Request, res: Response) => {
  try {
    const result = await createBillingPortalSession(req.user!.sub);
    res.json(result);
  } catch (err) { handleError(err, res); }
});

export default router;
