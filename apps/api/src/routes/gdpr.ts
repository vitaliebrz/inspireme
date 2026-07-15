import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { exportUserData, deleteOwnAccount } from '../services/gdpr.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// GET /gdpr/export — descarcă toate datele proprii ca JSON
router.get('/export', async (req: Request, res: Response) => {
  try {
    const data = await exportUserData(req.user!.sub);
    const filename = `inspireme-date-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  } catch (err) { handleError(err, res); }
});

// POST /gdpr/account/delete — ștergere cont self-service (confirmare parolă)
router.post(
  '/account/delete',
  [body('password').isString().notEmpty().withMessage('Parola este obligatorie.')],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { password } = req.body as { password: string };
      const result = await deleteOwnAccount(req.user!.sub, password);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

export default router;
