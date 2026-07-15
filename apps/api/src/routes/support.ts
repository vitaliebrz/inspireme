import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import {
  prismaCreateAnonymousTicket,
  getOrCreateUserTicket, getUserTicketWithMessages, sendUserMessage,
  getAdminTickets, getAdminTicketMessages, sendAdminMessage,
  resolveTicket, reopenTicket,
  getPublicTicket, sendAnonymousReply,
} from '../services/support.service.js';

const router = Router();

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// POST /support — public, fără autentificare (pagina de login, cont suspendat)
router.post(
  '/',
  generalLimiter,
  [
    body('name').isString().trim().isLength({ min: 2, max: 100 }),
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
    body('message').isString().trim().isLength({ min: 10, max: 2000 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { name, email, message } = req.body as { name: string; email: string; message: string };
      const ticket = await prismaCreateAnonymousTicket({ name, email, message });
      res.status(201).json({ success: true, id: ticket.id });
    } catch (err) { handleError(err, res); }
  },
);

// ─── RUTE PUBLICE (anonim, fără autentificare) ───────────────────────────────

// GET /support/public/:id — obține conversația anonimă (acces prin UUID secret)
router.get(
  '/public/:id',
  generalLimiter,
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const ticket = await getPublicTicket(req.params['id'] as string);
      res.json({ ticket });
    } catch (err) { handleError(err, res); }
  },
);

// POST /support/public/:id/reply — răspuns anonim (validat prin email)
router.post(
  '/public/:id/reply',
  generalLimiter,
  [
    param('id').isUUID(),
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
    body('content').isString().trim().isLength({ min: 1, max: 2000 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { email, content } = req.body as { email: string; content: string };
      const result = await sendAnonymousReply(req.params['id'] as string, email, content);
      res.status(201).json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─── RUTE UTILIZATOR (autentificare necesară) ────────────────────────────────

router.use('/me', authenticate, generalLimiter);

// GET /support/me — obține sau creează conversația utilizatorului + mesaje
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const ticket = await getUserTicketWithMessages(userId);
    res.json({ ticket });
  } catch (err) { handleError(err, res); }
});

// POST /support/me/init — creează conversația dacă nu există
router.post(
  '/me/init',
  [body('name').isString().trim().isLength({ min: 2, max: 100 }), body('email').isEmail()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { name, email } = req.body as { name: string; email: string };
      const ticket = await getOrCreateUserTicket(req.user!.sub, name, email);
      res.json({ ticketId: ticket.id });
    } catch (err) { handleError(err, res); }
  },
);

// POST /support/me/message — trimite mesaj în conversație
router.post(
  '/me/message',
  [body('content').isString().trim().isLength({ min: 1, max: 2000 })],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { content } = req.body as { content: string };
      const result = await sendUserMessage(req.user!.sub, content);
      res.status(201).json(result);
    } catch (err) { handleError(err, res); }
  },
);

// ─── RUTE ADMIN ──────────────────────────────────────────────────────────────

router.use('/admin', authenticate, requireAdmin);

// GET /support/admin — lista tuturor conversațiilor
router.get('/admin', async (_req: Request, res: Response) => {
  try {
    const tickets = await getAdminTickets();
    res.json({ tickets });
  } catch (err) { handleError(err, res); }
});

// GET /support/admin/:id/messages — mesajele unei conversații
router.get(
  '/admin/:id/messages',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const ticket = await getAdminTicketMessages(req.params['id'] as string);
      res.json({ ticket });
    } catch (err) { handleError(err, res); }
  },
);

// POST /support/admin/:id/message — admin trimite mesaj
router.post(
  '/admin/:id/message',
  [param('id').isUUID(), body('content').isString().trim().isLength({ min: 1, max: 2000 })],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { content } = req.body as { content: string };
      const msg = await sendAdminMessage(req.params['id'] as string, req.user!.sub, content);
      res.status(201).json({ message: msg });
    } catch (err) { handleError(err, res); }
  },
);

// PATCH /support/admin/:id/resolve — închide conversația
router.patch(
  '/admin/:id/resolve',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await resolveTicket(req.params['id'] as string);
      res.json({ success: true });
    } catch (err) { handleError(err, res); }
  },
);

// PATCH /support/admin/:id/reopen — redeschide conversația
router.patch(
  '/admin/:id/reopen',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await reopenTicket(req.params['id'] as string);
      res.json({ success: true });
    } catch (err) { handleError(err, res); }
  },
);

export default router;
