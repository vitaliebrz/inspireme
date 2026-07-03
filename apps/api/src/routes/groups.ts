import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  createGroup,
  getGroups,
  getGroupDetails,
  getGroupMessages,
  sendGroupMessage,
  addGroupMember,
  removeGroupMember,
} from '../services/group.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// POST /groups — creare grup nou
router.post(
  '/',
  [
    body('name').isString().trim().isLength({ min: 2, max: 50 }),
    body('memberIds').isArray({ min: 1 }),
    body('memberIds.*').isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { name, memberIds } = req.body as { name: string; memberIds: string[] };
      const group = await createGroup(req.user!.sub, name, memberIds);
      res.status(201).json({ group });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /groups — lista grupurilor în care sunt membru
router.get('/', async (req: Request, res: Response) => {
  try {
    const groups = await getGroups(req.user!.sub);
    res.json({ groups });
  } catch (err) {
    handleError(err, res);
  }
});

// GET /groups/:id — detalii grup (membri, info)
router.get(
  '/:id',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const group = await getGroupDetails(req.params['id'] as string, req.user!.sub);
      res.json({ group });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// GET /groups/:id/messages — mesaje grup (cursor-based pagination)
router.get(
  '/:id/messages',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const cursor = req.query['cursor'] as string | undefined;
      const result = await getGroupMessages(req.params['id'] as string, req.user!.sub, cursor);
      res.json(result);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// POST /groups/:id/messages — trimite mesaj în grup
router.post(
  '/:id/messages',
  [
    param('id').isUUID(),
    body('content').isString().trim().isLength({ min: 1, max: 4000 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const message = await sendGroupMessage(
        req.params['id'] as string,
        req.user!.sub,
        req.body['content'] as string,
      );
      res.status(201).json(message);
    } catch (err) {
      handleError(err, res);
    }
  },
);

// POST /groups/:id/members — adaugă un membru (doar admin)
router.post(
  '/:id/members',
  [param('id').isUUID(), body('userId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await addGroupMember(
        req.params['id'] as string,
        req.user!.sub,
        req.body['userId'] as string,
      );
      res.json({ success: true });
    } catch (err) {
      handleError(err, res);
    }
  },
);

// DELETE /groups/:id/members/:userId — elimină un membru sau iesi din grup
router.delete(
  '/:id/members/:userId',
  [param('id').isUUID(), param('userId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await removeGroupMember(
        req.params['id'] as string,
        req.user!.sub,
        req.params['userId'] as string,
      );
      res.json({ success: true });
    } catch (err) {
      handleError(err, res);
    }
  },
);

export default router;
