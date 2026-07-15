import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { MessageType, Plan } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadChatFile, validateMagicBytes } from '../middleware/upload.js';
import { cloudinary } from '../lib/cloudinary.js';
import {
  createConnectionRequest, respondToConnectionRequest, getPendingRequests,
  getConversations, getConversationWith, getMessages, sendMessage,
  markMessagesAsRead, blockUser, unblockUser, reportContent, openIdeaInConversation,
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

// POST /chat/connect — antreprenor trimite cerere legată de o idee
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

// POST /chat/request — cerere de mesaj directă (fără ideaId, orice rol)
router.post(
  '/request',
  [
    body('toUserId').isUUID(),
    body('message').optional().isString().trim().isLength({ max: 500 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { toUserId } = req.body as { toUserId: string };
      if (toUserId === req.user!.sub) {
        res.status(400).json({ error: 'Nu poți trimite o cerere ție însuți.' });
        return;
      }
      const result = await createConnectionRequest(req.user!.sub, req.user!.plan as Plan, toUserId);
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

// GET /chat/with/:userId — verifică dacă există deja o conversație cu un utilizator
router.get(
  '/with/:userId',
  [param('userId').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const result = await getConversationWith(req.user!.sub, req.params['userId'] as string);
      res.json(result ?? { conversationId: null });
    } catch (err) { handleError(err, res); }
  },
);

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
    body('replyToId').optional().isUUID(),
    body('ideaId').optional().isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { content, replyToId, ideaId } = req.body as { content: string; replyToId?: string; ideaId?: string };
      const message = await sendMessage(
        req.params['id'] as string,
        req.user!.sub,
        req.user!.plan as Plan,
        content,
        MessageType.TEXT,
        undefined,
        replyToId,
        ideaId,
      );
      res.status(201).json(message);
    } catch (err) { handleError(err, res); }
  },
);

// POST /chat/conversations/:id/open-idea — creează EVENT idempotent când deschizi conv. despre o idee nouă
router.post(
  '/conversations/:id/open-idea',
  [
    param('id').isUUID(),
    body('ideaId').isUUID(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { ideaId } = req.body as { ideaId: string };
      const result = await openIdeaInConversation(req.params['id'] as string, req.user!.sub, ideaId);
      res.json(result);
    } catch (err) { handleError(err, res); }
  },
);

// PATCH /chat/conversations/:id/read — marchează mesajele celuilalt ca citite
router.patch(
  '/conversations/:id/read',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const readAt = await markMessagesAsRead(req.params['id'] as string, req.user!.sub);
      res.json({ readAt });
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

      // Validare tip REAL prin magic bytes (nu doar mimetype)
      if (!validateMagicBytes(file.buffer, file.mimetype)) {
        res.status(400).json({ error: 'Fișier invalid sau tip nepermis.' });
        return;
      }

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
