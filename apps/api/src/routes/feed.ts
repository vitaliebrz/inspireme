import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { getIdeasFeed, getAntreprenoriFeed, getFeedStats } from '../services/feed.service.js';

const router = Router();

router.use(generalLimiter);

// GET /feed/stats — PUBLIC: doar contoare agregate, afișate pe paginile de înregistrare
// (vizitatorii nelogați). Trebuie să rămână înainte de router.use(authenticate).
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getFeedStats();
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

router.use(authenticate);

// GET /feed/ideas?category=TECH&cursor=xxx
router.get(
  '/ideas',
  [
    query('category').optional().isString().trim().isLength({ min: 1, max: 50 }),
    query('cursor').optional().isString(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.sub;
      const category = req.query['category'] as string | undefined;
      const cursor = req.query['cursor'] as string | undefined;
      const result = await getIdeasFeed({ userId, category, cursor });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Eroare server' });
    }
  },
);

// GET /feed/antreprenori?cursor=xxx
router.get(
  '/antreprenori',
  [query('cursor').optional().isString()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.sub;
      const cursor = req.query['cursor'] as string | undefined;
      const result = await getAntreprenoriFeed({ userId, cursor });
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Eroare server' });
    }
  },
);

export default router;
