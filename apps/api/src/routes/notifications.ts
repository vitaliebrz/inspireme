import { Router, Request, Response } from 'express';
import { param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  getNotifications, getUnreadCount, markAsRead, markAllAsRead,
} from '../services/notifications.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// GET /notifications — lista notificări
router.get(
  '/',
  [query('unread').optional().isBoolean()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const unreadOnly = req.query['unread'] === 'true';
      const notifications = await getNotifications(req.user!.sub, unreadOnly);
      res.json({ notifications });
    } catch (err) { handleError(err, res); }
  },
);

// GET /notifications/count — număr necitite
router.get('/count', async (req: Request, res: Response) => {
  try {
    const count = await getUnreadCount(req.user!.sub);
    res.json({ count });
  } catch (err) { handleError(err, res); }
});

// PATCH /notifications/:id/read — marcare citită
router.patch(
  '/:id/read',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await markAsRead(req.params['id'] as string, req.user!.sub);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// PATCH /notifications/read-all — marcare toate citite
router.patch('/read-all', async (req: Request, res: Response) => {
  try {
    const result = await markAllAsRead(req.user!.sub);
    res.json(result);
  } catch (err) { handleError(err, res); }
});

export default router;
