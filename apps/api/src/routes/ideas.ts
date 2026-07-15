import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { IdeaVisibility, IdeaStatus, Plan } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { requireElev } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadIdeaImages, uploadIdeaPdf, compressToWebp, validateMagicBytes } from '../middleware/upload.js';
import { cloudinary, deleteAsset } from '../lib/cloudinary.js';
import {
  createIdea, getIdeaById, updateIdea, deleteIdea,
  addIdeaImages, addIdeaPdf, deleteIdeaPdf, getMyIdeas, submitFeedback,
} from '../services/ideas.service.js';

const router = Router();

router.use(authenticate);
router.use(generalLimiter);

// Tipul de eroare cu status opțional
type AppError = Error & { status?: number };

function handleError(err: unknown, res: Response) {
  console.error('[ideas]', err);
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
    body('categories').isArray({ min: 1 }).withMessage('Cel puțin o categorie este obligatorie.')
      .custom((v: unknown[]) => v.every((c) => typeof c === 'string' && c.length >= 2 && c.length <= 50))
      .withMessage('Categorie invalidă.'),
    body('problem').isString().trim().isLength({ min: 20, max: 5000 }).withMessage('Problema trebuie să aibă 20-5000 caractere.'),
    body('solution').isString().trim().isLength({ min: 20, max: 5000 }).withMessage('Soluția trebuie să aibă 20-5000 caractere.'),
    body('targetAudience').optional().isString().trim().isLength({ max: 500 }),
    body('tags').optional().isArray({ max: 5 }),
    body('visibility').optional().isIn(Object.values(IdeaVisibility)),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { title, categories, problem, solution, targetAudience, tags, visibility } = req.body as {
        title: string; categories: string[]; problem: string; solution: string;
        targetAudience?: string; tags?: string[]; visibility?: IdeaVisibility;
      };
      const idea = await createIdea({
        userId: req.user!.sub,
        userEmail: req.user!.email,
        userPlan: req.user!.plan as Plan,
        title, categories, problem, solution, targetAudience, tags, visibility,
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
        files.map(async (f) => {
          const webp = await compressToWebp(f.buffer);
          return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
            cloudinary.uploader.upload_stream(
              { folder: 'ideas', resource_type: 'image', fetch_format: 'auto', quality: 'auto' },
              (err, result) => {
                if (err || !result) return reject(err ?? new Error('Upload imagine eșuat'));
                resolve(result as { secure_url: string; public_id: string });
              },
            ).end(webp);
          });
        }),
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

      // Validare tip REAL prin magic bytes (nu doar mimetype, care e falsificabil)
      if (!validateMagicBytes(file.buffer, file.mimetype)) {
        res.status(400).json({ error: 'Fișierul nu este un PDF valid.' });
        return;
      }

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
  [param('id').isString().trim().notEmpty()],
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
    param('id').isString().trim().notEmpty(),
    body('title').optional().isString().trim().isLength({ min: 5, max: 150 }),
    body('categories').optional().isArray({ min: 1 })
      .custom((v: unknown[]) => v.every((c) => typeof c === 'string' && c.length >= 2 && c.length <= 50))
      .withMessage('Categorie invalidă.'),
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
// ─────────────────────────────────────────────
// DELETE /ideas/:id/images/:imageId — șterge imagine existentă
// ─────────────────────────────────────────────
// DELETE /ideas/:id/pdf — șterge PDF-ul existent
router.delete(
  '/:id/pdf',
  requireElev,
  [param('id').isString().trim().notEmpty()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await deleteIdeaPdf(req.params['id'] as string, req.user!.sub);
      res.json({ success: true });
    } catch (err) { handleError(err, res); }
  },
);

router.delete(
  '/:id/images/:imageId',
  requireElev,
  [
    param('id').isString().trim().notEmpty(),
    param('imageId').isString().trim().notEmpty(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const { id, imageId } = req.params as { id: string; imageId: string };
      const { prisma } = await import('../lib/prisma.js');
      const image = await prisma.ideaImage.findFirst({
        where: { id: imageId, ideaId: id, idea: { userId: req.user!.sub } },
        select: { id: true, publicId: true },
      });
      if (!image) { res.status(404).json({ error: 'Imaginea nu a fost găsită.' }); return; }
      await prisma.ideaImage.delete({ where: { id: imageId } });
      if (image.publicId) deleteAsset(image.publicId, 'image').catch(() => {});
      res.json({ success: true });
    } catch (err) { handleError(err, res); }
  },
);

router.delete(
  '/:id',
  requireElev,
  [param('id').isString().trim().notEmpty()],
  validate,
  async (req: Request, res: Response) => {
    try {
      await deleteIdea(req.params['id'] as string, req.user!.sub);
      res.json({ success: true });
    } catch (err) { handleError(err, res); }
  },
);

// POST /ideas/:id/feedback — feedback de la antreprenor (upsert)
router.post(
  '/:id/feedback',
  [
    param('id').isString().trim().notEmpty(),
    body('ratingGeneral').isInt({ min: 1, max: 5 }),
    body('comment').optional().isString().trim().isLength({ max: 1000 }),
    body('interestedInCollab').optional().isBoolean(),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      if (req.user!.role !== 'ANTREPRENOR' && req.user!.role !== 'ADMIN') {
        res.status(403).json({ error: 'Doar antreprenorii pot lăsa feedback.' }); return;
      }
      const { ratingGeneral, comment, interestedInCollab } = req.body as {
        ratingGeneral: number; comment?: string; interestedInCollab?: boolean;
      };
      const feedback = await submitFeedback(
        req.params['id'] as string,
        req.user!.sub,
        ratingGeneral,
        comment,
        interestedInCollab,
      );
      res.json({ feedback });
    } catch (err) { handleError(err, res); }
  },
);

export default router;
