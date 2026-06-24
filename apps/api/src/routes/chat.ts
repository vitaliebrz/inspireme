import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { MessageType, Plan } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadChatFile } from '../middleware/upload.js';
import { cloudinary } from '../lib/cloudinary.js';
import {
  createConnectionRequest, respondToConnectionRequest, getPendingRequests,
  getConversations, getMessages, sendMessage,
  blockUser, unblockUser, reportContent,
} from '../services/chat.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// ─────────────────────────────────────────────
// CERERI CONECTARE
// ─────────────────────────────────────────────

// POST /chat/connect — antreprenor trimite cerere
router.post(
  '/connect',
  [
    body('toUserId').isUUID(),
    body('ideaId').isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ANTREPRENOR') { res.status(403).json({ error: 'Doar antreprenorii pot trimite cereri.' }); return; }
      const { toUserId, ideaId } = req.body as { toUserId: string; ideaId: string };
      const result = await createConnectionRequest(req.user!.sub, req.user!.plan as Plan, toUserId, ideaId);
      res.status(201).json(result);
    } catch (err) { handleError(err, res); }
  },
);

// GET /chat/requests — cereri primite (elev)
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const requests = await getPendingRequests(req.user!.sub);
    res.json({ requests });
  } catch (err) { handleError(err, res); }
});

// PATCH /chat/requests/:id — răspuns la cerere
router.patch(
  '/requests/:id',
  [
    param('id').isUUID(),
    body('action').isIn(['ACCEPTED', 'REFUSED']),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { action } = req.body as { action: 'ACCEPTED' | 'REFUSED' };
      const result = await respondToConnectionRequest(req.params['id'] as string, req.user!.sub, action);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// CONVERSAȚII
// ─────────────────────────────────────────────

// GET /chat/conversations
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const conversations = await getConversations(req.user!.sub);
    res.json({ conversations });
  } catch (err) { handleError(err, res); }
});

// GET /chat/conversations/:id/messages
router.get(
  '/conversations/:id/messages',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const cursor = req.query['cursor'] as string | undefined;
      const result = await getMessages(req.params['id'] as string, req.user!.sub, cursor);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// POST /chat/conversations/:id/messages — trimite mesaj text
router.post(
  '/conversations/:id/messages',
  [
    param('id').isUUID(),
    body('content').isString().trim().isLength({ min: 1, max: 4000 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { content } = req.body as { content: string };
      const message = await sendMessage(
        req.params['id'] as string,
        req.user!.sub,
        req.user!.plan as Plan,
        content,
        MessageType.TEXT,
      );
      res.status(201).json(message);
    } catch (err) { handleError(err, res); }
  },
);

// POST /chat/conversations/:id/upload — upload fișier în chat
router.post(
  '/conversations/:id/upload',
  uploadLimiter,
  uploadChatFile.single('file'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'Niciun fișier primit.' }); return; }

      const isImage = file.mimetype.startsWith('image/');
      const uploaded = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        {
          folder: 'chat',
          resource_type: isImage ? 'image' : 'raw',
          ...(isImage ? { transformation: [{ quality: 'auto', fetch_format: 'auto' }] } : {}),
        },
      );

      const message = await sendMessage(
        req.params['id'] as string,
        req.user!.sub,
        req.user!.plan as Plan,
        file.originalname,
        isImage ? MessageType.IMAGE : MessageType.PDF,
        uploaded.secure_url,
      );

      res.status(201).json(message);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// BLOCARE / DEBLOCARE
// ─────────────────────────────────────────────

// POST /chat/block/:userId
router.post(
  '/block/:userId',
  [param('userId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await blockUser(req.user!.sub, req.params['userId'] as string);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// DELETE /chat/block/:userId
router.delete(
  '/block/:userId',
  [param('userId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await unblockUser(req.user!.sub, req.params['userId'] as string);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// RAPORTARE
// ─────────────────────────────────────────────

// POST /chat/report
router.post(
  '/report',
  [
    body('contentType').isIn(['IDEA', 'MESSAGE', 'USER']),
    body('contentId').isUUID(),
    body('reason').isString().trim().isLength({ min: 10, max: 500 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { contentType, contentId, reason } = req.body as {
        contentType: 'IDEA' | 'MESSAGE' | 'USER';
        contentId: string;
        reason: string;
      };
      const report = await reportContent(req.user!.sub, contentType, contentId, reason);
      res.status(201).json(report);
    } catch (err) { handleError(err, res); }
  },
);

export default router;
