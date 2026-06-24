import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { Role } from '@prisma/client';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  getDashboardStats, getUsers, getPendingReports, resolveReport,
  getBlockedContent, unblockContent, suspendUser, unsuspendUser,
} from '../services/admin.service.js';

const router = Router();
router.use(authenticate);
router.use(requireAdmin);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// GET /admin/stats
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await getDashboardStats();
    res.json(stats);
  } catch (err) { handleError(err, res); }
});

// GET /admin/users
router.get(
  '/users',
  [
    query('search').optional().isString().trim(),
    query('role').optional().isIn(Object.values(Role)),
    query('page').optional().isInt({ min: 1 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await getUsers({
        search: req.query['search'] as string | undefined,
        role: req.query['role'] as Role | undefined,
        page: req.query['page'] ? parseInt(req.query['page'] as string, 10) : 1,
      });
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// POST /admin/users/:id/suspend
router.post(
  '/users/:id/suspend',
  [param('id').isUUID(), body('reason').isString().trim().isLength({ min: 10, max: 500 })],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { reason } = req.body as { reason: string };
      const result = await suspendUser(req.params['id'] as string, req.user!.sub, reason);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// POST /admin/users/:id/unsuspend
router.post(
  '/users/:id/unsuspend',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await unsuspendUser(req.params['id'] as string);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// GET /admin/reports
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const reports = await getPendingReports();
    res.json({ reports });
  } catch (err) { handleError(err, res); }
});

// POST /admin/reports/:id/resolve
router.post(
  '/reports/:id/resolve',
  [
    param('id').isUUID(),
    body('action').isIn(['DISMISS', 'AVERTISMENT', 'ELIMINARE_CONTINUT', 'SUSPENDARE_CONT']),
    body('targetUserId').optional().isUUID(),
    body('reason').optional().isString().trim().isLength({ min: 10 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { action, targetUserId, reason } = req.body as {
        action: 'DISMISS' | 'AVERTISMENT' | 'ELIMINARE_CONTINUT' | 'SUSPENDARE_CONT';
        targetUserId?: string;
        reason?: string;
      };
      const result = await resolveReport(req.params['id'] as string, req.user!.sub, action, targetUserId, reason);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// GET /admin/blocked-content
router.get('/blocked-content', async (req: Request, res: Response) => {
  try {
    const content = await getBlockedContent();
    res.json({ content });
  } catch (err) { handleError(err, res); }
});

// DELETE /admin/blocked-content/:ideaId
router.delete(
  '/blocked-content/:ideaId',
  [param('ideaId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await unblockContent(req.params['ideaId'] as string);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

export default router;
