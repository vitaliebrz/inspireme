import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { guessIconName } from '../lib/guessIcon.js';


const router = Router();

// GET /categories — public, fără autentificare
router.get('/', async (_req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { order: 'asc' },
      select: { id: true, name: true, iconName: true, order: true },
    });
    res.json(categories);
  } catch (err) {
    console.error('[categories]', err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// POST /categories — orice utilizator autentificat poate adăuga categorii noi
router.post(
  '/',
  authenticate,
  [body('name').isString().trim().isLength({ min: 2, max: 50 })],
  validate,
  async (req: Request, res: Response) => {
    try {
      const raw = (req.body as { name: string }).name.trim();
      const name = raw.charAt(0).toUpperCase() + raw.slice(1);
      const iconName = guessIconName(name);
      const createdByUserId = req.user?.sub ?? null;
      const maxOrder = await prisma.category.aggregate({ _max: { order: true } });
      const cat = await prisma.category.create({
        data: { name, iconName, order: (maxOrder._max.order ?? 0) + 1, createdByUserId },
        select: { id: true, name: true, iconName: true, order: true },
      });
      res.status(201).json(cat);
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'P2002') {
        res.status(409).json({ error: 'Categoria există deja.' });
        return;
      }
      console.error('[categories POST]', err);
      res.status(500).json({ error: 'Eroare server' });
    }
  },
);

export default router;
