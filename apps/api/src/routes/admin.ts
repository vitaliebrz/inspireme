import { Router, Request, Response } from 'express';
import { body, param, query } from 'express-validator';
import { Role } from '@prisma/client';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { guessIconName } from '../lib/guessIcon.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  getDashboardStats, getUsers, getPendingReports, getResolvedReports, getReportDetail, resolveReport,
  getBlockedContent, unblockContent, suspendUser, unsuspendUser, deleteUser,
} from '../services/admin.service.js';
import { prisma } from '../lib/prisma.js';
import { redis, REDIS_KEYS } from '../lib/redis.js';
import { createNotification, sendCategoryDeletedEmail } from '../services/notifications.service.js';
import { readLogEntries, readLogFlow, countRecentErrors, getLogStats } from '../lib/logReader.js';

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

// DELETE /admin/users/:id
router.delete(
  '/users/:id',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await deleteUser(req.params['id'] as string, req.user!.sub);
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

// GET /admin/reports/count — număr rapoarte în așteptare (pentru badge nav)
router.get('/reports/count', async (_req: Request, res: Response) => {
  try {
    const pending = await prisma.report.count({ where: { status: 'PENDING' } });
    res.json({ pending });
  } catch (err) { handleError(err, res); }
});

// GET /admin/reports/history — rapoarte rezolvate (istoric)
router.get('/reports/history', async (req: Request, res: Response) => {
  try {
    const reports = await getResolvedReports();
    res.json({ reports });
  } catch (err) { handleError(err, res); }
});

// GET /admin/reports/:id/detail — detaliu raport (target, reporter, istoric moderare)
router.get(
  '/reports/:id/detail',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const detail = await getReportDetail(req.params['id'] as string);
      res.json(detail);
    } catch (err) { handleError(err, res); }
  },
);

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

// ─────────────────────────────────────────────
// Loguri (doar admin) — vizualizare erori + flux pe requestId
// ─────────────────────────────────────────────

// GET /admin/logs — listă loguri filtrate (newest-first)
router.get(
  '/logs',
  [
    query('level').optional().isIn(['all', 'info', 'warn', 'error']),
    query('search').optional().isString().trim().isLength({ max: 200 }),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const entries = await readLogEntries({
        level: req.query['level'] as 'all' | 'info' | 'warn' | 'error' | undefined,
        search: req.query['search'] as string | undefined,
        limit: req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined,
      });
      res.json({ entries });
    } catch (err) { handleError(err, res); }
  },
);

// GET /admin/logs/error-count — erori nevăzute pentru badge (momentul „văzut" e per admin,
// stocat pe server în Redis → sincronizat pe toate dispozitivele adminului)
router.get('/logs/error-count', async (req: Request, res: Response) => {
  try {
    const seen = await redis.get<number>(REDIS_KEYS.logsSeen(req.user!.sub)).catch(() => null);
    const sinceDate = typeof seen === 'number' && seen > 0 ? new Date(seen) : undefined;
    const count = await countRecentErrors(sinceDate);
    res.json({ count });
  } catch (err) { handleError(err, res); }
});

// POST /admin/logs/seen — adminul a deschis pagina de loguri → marcăm erorile ca văzute
router.post('/logs/seen', async (req: Request, res: Response) => {
  try {
    await redis.set(REDIS_KEYS.logsSeen(req.user!.sub), Date.now());
    res.json({ success: true });
  } catch (err) { handleError(err, res); }
});

// GET /admin/logs/stats — metrici agregate pentru dashboard (stil Grafana)
router.get(
  '/logs/stats',
  [query('window').optional().isIn(['1h', '6h', '24h', '7d'])],
  validate,
  async (req: Request, res: Response) => {
    try {
      const w = (req.query['window'] as string) ?? '24h';
      const windowMs = w === '1h' ? 3600_000
        : w === '6h' ? 6 * 3600_000
        : w === '7d' ? 7 * 24 * 3600_000
        : 24 * 3600_000;
      const stats = await getLogStats(windowMs);
      res.json(stats);
    } catch (err) { handleError(err, res); }
  },
);

// GET /admin/logs/flow/:reqId — fluxul complet al unei cereri
router.get(
  '/logs/flow/:reqId',
  [param('reqId').isString().trim().isLength({ min: 8, max: 64 })],
  validate,
  async (req: Request, res: Response) => {
    try {
      const entries = await readLogFlow(req.params['reqId'] as string);
      res.json({ entries });
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// Categorii dinamice
// ─────────────────────────────────────────────

// POST /admin/categories — adaugă categorie nouă
router.post(
  '/categories',
  [
    body('name')
      .isString().trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Numele categoriei trebuie să aibă 2-50 caractere.'),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const raw = (req.body as { name: string }).name.trim();
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      const exists = await prisma.category.findUnique({ where: { name } });
      if (exists) {
        res.status(409).json({ error: 'Categoria există deja.' });
        return;
      }
      const iconName = guessIconName(name);
      const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
      const order = (maxOrder._max.order ?? -1) + 1;
      const category = await prisma.category.create({
        data: { name, iconName, order },
        select: { id: true, name: true, iconName: true, order: true },
      });
      res.status(201).json(category);
    } catch (err) { handleError(err, res); }
  },
);

// PATCH /admin/categories/:id/icon — setează iconul manual
router.patch(
  '/categories/:id/icon',
  [
    param('id').isUUID(),
    body('iconName').optional({ nullable: true }).isString().trim().isLength({ max: 50 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const id = req.params['id'] as string;
      const { iconName } = req.body as { iconName: string | null };
      const cat = await prisma.category.update({
        where: { id },
        data: { iconName: iconName ?? null },
        select: { id: true, name: true, iconName: true, order: true },
      });
      res.json(cat);
    } catch (err) { handleError(err, res); }
  },
);

// DELETE /admin/categories/:name — șterge categorie, auto-elimină din idei, notifică elevii
router.delete(
  '/categories/:name',
  [
    param('name').isString().trim().isLength({ min: 2, max: 50 }),
    body('message').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params['name'] as string);
      const { message } = req.body as { message?: string };

      const category = await prisma.category.findUnique({
        where: { name },
        select: { createdByUserId: true },
      });
      if (!category) {
        res.status(404).json({ error: 'Categoria nu a fost găsită.' });
        return;
      }

      // Găsim toți elevii care au idei cu această categorie
      const affectedIdeas = await prisma.idea.findMany({
        where: { categories: { has: name } },
        select: { userId: true },
      });

      // Includem și creatorul categoriei (chiar dacă n-a salvat o idee cu ea)
      const ideaOwnerIds = affectedIdeas.map((i) => i.userId);
      const allUserIds = [...new Set([
        ...ideaOwnerIds,
        ...(category.createdByUserId ? [category.createdByUserId] : []),
      ])];

      // Eliminăm categoria din toate ideile (SQL direct — Prisma nu suportă array_remove)
      await prisma.$executeRaw`UPDATE ideas SET categories = array_remove(categories, ${name}) WHERE ${name} = ANY(categories)`;

      await prisma.category.delete({ where: { name } });

      // Mesaj de notificare — default dacă adminul nu a scris nimic
      const reason = message?.trim()
        || 'Categoria nu îndeplinea criteriile platformei sau era prea generală.';
      const notifBody = `Categoria „${name}" a fost eliminată. ${reason} Categoria a fost eliminată automat din ideile tale.`;

      // Notificăm în-app + email fiecare utilizator afectat
      const users = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, email: true },
      });

      await Promise.all(
        users.map(async (user) => {
          await createNotification({
            userId: user.id,
            type: 'SYSTEM',
            title: `Categorie eliminată: ${name}`,
            body: notifBody,
            data: { categoryName: name },
          });
          await sendCategoryDeletedEmail(user.email, name, reason).catch(() => {
            // email nu blochează răspunsul
          });
        }),
      );

      res.json({ success: true, affectedUsers: users.length });
    } catch (err) { handleError(err, res); }
  },
);

export default router;
