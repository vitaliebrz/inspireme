import { Router, Request, Response, raw } from 'express';
import { body } from 'express-validator';
import { Role } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  createCheckoutSession, createBillingPortalSession,
  getSubscriptionStatus, handleStripeWebhook,
  cancelSubscription,
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

// Abonamentele sunt doar pentru ELEV/ANTREPRENOR — adminii au deja acces Pro
// din oficiu (setat direct în DB) și nu trebuie să ajungă niciodată la Stripe.
const requireSubscriber = requireRole(Role.ELEV, Role.ANTREPRENOR);

// ─────────────────────────────────────────────
// POST /subscriptions/checkout — creare sesiune Stripe Checkout
// ─────────────────────────────────────────────
router.post(
  '/checkout',
  requireSubscriber,
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
router.post('/portal', requireSubscriber, async (req: Request, res: Response) => {
  try {
    const result = await createBillingPortalSession(req.user!.sub);
    res.json(result);
  } catch (err) { handleError(err, res); }
});

// ─────────────────────────────────────────────
// POST /subscriptions/cancel — anulare abonament, imediată (nu la final de perioadă)
// ─────────────────────────────────────────────
router.post('/cancel', requireSubscriber, async (req: Request, res: Response) => {
  try {
    const result = await cancelSubscription(req.user!.sub);
    res.json(result);
  } catch (err) { handleError(err, res); }
});

export default router;
