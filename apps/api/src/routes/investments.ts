import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { proposeDirectInvestment, confirmDirectInvestment, getMyInvestments } from '../services/investment.service.js';

const router = Router();
router.use(authenticate);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// GET /investments
router.get('/', async (req: Request, res: Response) => {
  try {
    const investments = await getMyInvestments(req.user!.sub);
    res.json({ investments });
  } catch (err) { handleError(err, res); }
});

// POST /investments — propune investiție directă (antreprenor)
router.post('/',
  [
    body('ideaId').isUUID(),
    body('amountDescription').isString().trim().isLength({ min: 5, max: 500 }),
    body('collaborationId').optional().isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ANTREPRENOR' && req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: 'Doar antreprenorii pot propune investiții.' }); return;
      }
      const { ideaId, amountDescription, collaborationId } = req.body as {
        ideaId: string; amountDescription: string; collaborationId?: string;
      };
      const investment = await proposeDirectInvestment(req.user!.sub, ideaId, amountDescription, collaborationId);
      res.status(201).json({ investment });
    } catch (err) { handleError(err, res); }
  },
);

// POST /investments/:id/confirm — confirmă investiție (elev)
router.post('/:id/confirm', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'ELEV' && req.user!.role !== 'ADMIN') {
      res.status(403).json({ error: 'Doar elevul poate confirma investiția.' }); return;
    }
    const result = await confirmDirectInvestment(req.params['id'] as string, req.user!.sub);
    res.json(result);
  } catch (err) { handleError(err, res); }
});

export default router;
