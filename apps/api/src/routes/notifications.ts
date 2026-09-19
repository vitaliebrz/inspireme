import { Router, Request, Response } from 'express';
import { param, query, body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  getNotifications, getUnreadCount, getNotificationCounts, markAsRead, markAllAsRead,
  markReadByConversation, markReadByGroup, markReadByTicket,
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

// GET /notifications/counts — count-uri exacte pentru badge-uri (total, mesaje, per-conversație/grup/suport)
router.get('/counts', async (req: Request, res: Response) => {
  try {
    const counts = await getNotificationCounts(req.user!.sub);
    res.json(counts);
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

// PATCH /notifications/read-conversation — marcare citite per conversație 1-1 sau grup
router.patch(
  '/read-conversation',
  [
    body('conversationId').optional().isUUID(),
    body('groupId').optional().isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { conversationId, groupId } = req.body as { conversationId?: string; groupId?: string };
      if (groupId) {
        const result = await markReadByGroup(req.user!.sub, groupId);
        res.json(result);
      } else if (conversationId) {
        const result = await markReadByConversation(req.user!.sub, conversationId);
        res.json(result);
      } else {
        res.status(400).json({ error: 'conversationId sau groupId obligatoriu.' });
      }
    } catch (err) { handleError(err, res); }
  },
);

// PATCH /notifications/read-support — marcare citite per ticket suport
router.patch(
  '/read-support',
  [body('ticketId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { ticketId } = req.body as { ticketId: string };
      const result = await markReadByTicket(req.user!.sub, ticketId);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

export default router;
