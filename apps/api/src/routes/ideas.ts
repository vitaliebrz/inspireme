import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { IdeaCategory, IdeaVisibility, IdeaStatus, Plan } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { requireElev } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadIdeaImages, uploadIdeaPdf } from '../middleware/upload.js';
import { cloudinary } from '../lib/cloudinary.js';
import {
  createIdea, getIdeaById, updateIdea, deleteIdea,
  addIdeaImages, addIdeaPdf, getMyIdeas,
} from '../services/ideas.service.js';

const router = Router();

router.use(authenticate);
router.use(generalLimiter);

// Tipul de eroare cu status opțional
type AppError = Error & { status?: number };

function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  const status = e.status ?? 500;
  res.status(status).json({ error: e.message ?? 'Eroare server' });
}

// ─────────────────────────────────────────────
// GET /ideas/me — ideile mele (elev)
// ─────────────────────────────────────────────
router.get('/me', requireElev, async (req: Request, res: Response) => {
  try {
    const ideas = await getMyIdeas(req.user!.sub);
    res.json({ ideas });
  } catch (err) { handleError(err, res); }
});

// ─────────────────────────────────────────────
// POST /ideas — creare idee (elev only)
// ─────────────────────────────────────────────
router.post(
  '/',
  requireElev,
  [
    body('title').isString().trim().isLength({ min: 5, max: 150 }).withMessage('Titlul trebuie să aibă 5-150 caractere.'),
    body('category').isIn(Object.values(IdeaCategory)).withMessage('Categorie invalidă.'),
    body('problem').isString().trim().isLength({ min: 20, max: 5000 }).withMessage('Problema trebuie să aibă 20-5000 caractere.'),
    body('solution').isString().trim().isLength({ min: 20, max: 5000 }).withMessage('Soluția trebuie să aibă 20-5000 caractere.'),
    body('targetAudience').optional().isString().trim().isLength({ max: 500 }),
    body('tags').optional().isArray({ max: 5 }),
    body('visibility').optional().isIn(Object.values(IdeaVisibility)),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { title, category, problem, solution, targetAudience, tags, visibility } = req.body as {
        title: string; category: IdeaCategory; problem: string; solution: string;
        targetAudience?: string; tags?: string[]; visibility?: IdeaVisibility;
      };
      const idea = await createIdea({
        userId: req.user!.sub,
        userPlan: req.user!.plan as Plan,
        title, category, problem, solution, targetAudience, tags, visibility,
      });
      res.status(201).json({ id: idea.id });
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /ideas/:id/images — upload imagini
// ─────────────────────────────────────────────
router.post(
  '/:id/images',
  requireElev,
  uploadLimiter,
  uploadIdeaImages.array('images', 10),
  async (req: Request, res: Response) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (!files.length) { res.status(400).json({ error: 'Niciun fișier primit.' }); return; }

      const uploaded = await Promise.all(
        files.map((f) =>
          cloudinary.uploader.upload(
            `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
            { folder: 'ideas', resource_type: 'image', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
          ),
        ),
      );

      await addIdeaImages({
        ideaId: req.params['id'] as string,
        userId: req.user!.sub,
        images: uploaded.map((u) => ({ url: u.secure_url, publicId: u.public_id })),
      });

      res.json({ urls: uploaded.map((u) => u.secure_url) });
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /ideas/:id/pdf — upload PDF
// ─────────────────────────────────────────────
router.post(
  '/:id/pdf',
  requireElev,
  uploadLimiter,
  uploadIdeaPdf.single('pdf'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'Niciun fișier primit.' }); return; }

      const uploaded = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        { folder: 'ideas/pdfs', resource_type: 'raw' },
      );

      await addIdeaPdf({
        ideaId: req.params['id'] as string,
        userId: req.user!.sub,
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        filename: file.originalname,
        size: file.size,
      });

      res.json({ url: uploaded.secure_url });
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// GET /ideas/:id — detalii idee
// ─────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const idea = await getIdeaById(req.params['id'] as string, req.user!.sub);
      res.json(idea);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// PATCH /ideas/:id — editare idee
// ─────────────────────────────────────────────
router.patch(
  '/:id',
  requireElev,
  [
    param('id').isUUID(),
    body('title').optional().isString().trim().isLength({ min: 5, max: 150 }),
    body('category').optional().isIn(Object.values(IdeaCategory)),
    body('problem').optional().isString().trim().isLength({ min: 20, max: 5000 }),
    body('solution').optional().isString().trim().isLength({ min: 20, max: 5000 }),
    body('targetAudience').optional().isString().trim().isLength({ max: 500 }),
    body('tags').optional().isArray({ max: 5 }),
    body('visibility').optional().isIn(Object.values(IdeaVisibility)),
    body('status').optional().isIn([IdeaStatus.IN_COLABORARE, IdeaStatus.REALIZAT]),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const updated = await updateIdea({
        ideaId: req.params['id'] as string,
        userId: req.user!.sub,
        ...req.body as Record<string, string>,
      });
      res.json(updated);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// DELETE /ideas/:id — ștergere idee
// ─────────────────────────────────────────────
router.delete(
  '/:id',
  requireElev,
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await deleteIdea(req.params['id'] as string, req.user!.sub);
      res.json({ success: true });
    } catch (err) { handleError(err, res); }
  },
);

export default router;
