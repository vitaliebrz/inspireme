import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { Plan, GiveawayStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  createGiveaway, getGiveaways, getGiveawayById,
  joinGiveaway, leaveGiveaway, selectWinner,
  confirmInvestment, contactGiveawayWinner, getMyGiveaways,
} from '../services/giveaway.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// ─────────────────────────────────────────────
// GET /giveaways — listare (cu filtru opțional status)
// ─────────────────────────────────────────────
router.get(
  '/',
  [query('status').optional().isIn(Object.values(GiveawayStatus))],
  validate,
  async (req: Request, res: Response) => {
    try {
      const status = req.query['status'] as GiveawayStatus | undefined;
      const giveaways = await getGiveaways(status, req.user!.sub);
      res.json({ giveaways });
    } catch (err) { handleError(err, res); }
  },
);

// GET /giveaways/mine — giveaway-urile antreprenorului curent
router.get('/mine', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ANTREPRENOR' && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Doar antreprenorii.' }); return;
    }
    const giveaways = await getMyGiveaways(req.user!.sub);
    res.json({ giveaways });
  } catch (err) { handleError(err, res); }
});

// ─────────────────────────────────────────────
// POST /giveaways — creare (antreprenor Pro)
// ─────────────────────────────────────────────
router.post(
  '/',
  [
    body('title').isString().trim().isLength({ min: 5, max: 200 }),
    body('description').isString().trim().isLength({ min: 20, max: 5000 }),
    body('investmentDescription').isString().trim().isLength({ min: 3, max: 1000 }),
    body('startDate').isISO8601(),
    body('endDate').isISO8601(),
    body('maxParticipants').optional().isInt({ min: 2, max: 10000 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ANTREPRENOR' && req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: 'Doar antreprenorii.' }); return;
      }
      const { title, description, investmentDescription, startDate, endDate, maxParticipants } = req.body as {
        title: string; description: string; investmentDescription: string;
        startDate: string; endDate: string; maxParticipants?: number;
      };
      const antreprenorPlan = req.user!.role === 'ADMIN' ? Plan.PRO : req.user!.plan as Plan;
      const giveaway = await createGiveaway({
        antreprenorId: req.user!.sub,
        antreprenorPlan,
        title, description, investmentDescription,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        maxParticipants,
      });
      res.status(201).json(giveaway);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// GET /giveaways/:id — detalii
// ─────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const giveaway = await getGiveawayById(req.params['id'] as string, req.user!.sub);
      res.json(giveaway);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /giveaways/:id/join — participare (elev)
// ─────────────────────────────────────────────
router.post(
  '/:id/join',
  [
    param('id').isUUID(),
    body('ideaId').isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ELEV') { res.status(403).json({ error: 'Doar elevii pot participa.' }); return; }
      const { ideaId } = req.body as { ideaId: string };
      const result = await joinGiveaway(req.params['id'] as string, req.user!.sub, ideaId);
      res.status(201).json(result);
    } catch (err) { handleError(err, res); }
  },
);

// DELETE /giveaways/:id/join — retragere din giveaway
router.delete(
  '/:id/join',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ELEV') { res.status(403).json({ error: 'Doar elevii.' }); return; }
      const result = await leaveGiveaway(req.params['id'] as string, req.user!.sub);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /giveaways/:id/winner — selecție câștigător (antreprenor, server-side crypto)
// ─────────────────────────────────────────────
router.post(
  '/:id/winner',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ANTREPRENOR' && req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: 'Doar antreprenorii.' }); return;
      }
      const result = await selectWinner(req.params['id'] as string, req.user!.sub);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /giveaways/:id/confirm — confirmare investiție
// ─────────────────────────────────────────────
router.post(
  '/:id/confirm',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await confirmInvestment(req.params['id'] as string, req.user!.sub, req.user!.role);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// POST /giveaways/:id/contact-winner — antreprenorul contactează câștigătorul
router.post(
  '/:id/contact-winner',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const plan = req.user!.role === 'ADMIN' ? Plan.PRO : (req.user!.plan as Plan);
      const result = await contactGiveawayWinner(req.params['id'] as string, req.user!.sub, plan);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

export default router;
