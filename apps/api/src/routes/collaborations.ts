import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { getMyCollaborations, initiateCollaboration, confirmCollaboration, getConversationIdeas } from '../services/collaboration.service.js';

const router = Router();

router.use(authenticate);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// GET /collaborations — colaborările mele (ca elev sau antreprenor)
router.get('/', async (req: Request, res: Response) => {
  try {
    const collaborations = await getMyCollaborations(req.user!.sub);
    res.json({ collaborations });
  } catch (err) { handleError(err, res); }
});

// GET /collaborations/ideas/:conversationId — ideile comune dintr-o conversație
router.get('/ideas/:conversationId', async (req: Request, res: Response) => {
  try {
    const ideas = await getConversationIdeas(req.params['conversationId'] as string, req.user!.sub);
    res.json({ ideas });
  } catch (err) { handleError(err, res); }
});

// POST /collaborations/initiate/:conversationId — inițiază o colaborare din conversație existentă
router.post('/initiate/:conversationId',
  body('ideaId').optional().isUUID(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Date invalide.', details: errors.array() });
    try {
      const collaboration = await initiateCollaboration(
        req.params['conversationId'] as string,
        req.user!.sub,
        req.body.ideaId as string | undefined,
      );
      res.json({ collaboration });
    } catch (err) { handleError(err, res); }
  });

// POST /collaborations/:id/confirm — confirmă colaborarea
router.post('/:id/confirm', async (req: Request, res: Response) => {
  try {
    const collaboration = await confirmCollaboration(req.params['id'] as string, req.user!.sub);
    res.json({ collaboration });
  } catch (err) { handleError(err, res); }
});

export default router;
