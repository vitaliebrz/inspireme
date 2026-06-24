import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { Role } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadAvatar } from '../middleware/upload.js';
import { cloudinary } from '../lib/cloudinary.js';
import {
  getMyProfile, updateElevProfile, updateAntreprenorProfile,
  getPublicElevProfile, getPublicAntreprenorProfile,
} from '../services/profiles.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// ─────────────────────────────────────────────
// GET /profiles/me — profil propriu complet
// ─────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  try {
    const profile = await getMyProfile(req.user!.sub, req.user!.role as Role);
    res.json(profile);
  } catch (err) { handleError(err, res); }
});

// ─────────────────────────────────────────────
// PATCH /profiles/me — actualizare profil
// ─────────────────────────────────────────────
router.patch(
  '/me',
  [
    body('firstName').optional().isString().trim().isLength({ min: 1, max: 50 }),
    body('lastName').optional().isString().trim().isLength({ min: 1, max: 50 }),
    body('bio').optional().isString().trim().isLength({ max: 500 }),
    body('bioMentor').optional().isString().trim().isLength({ max: 1000 }),
    body('city').optional().isString().trim().isLength({ max: 100 }),
    body('school').optional().isString().trim().isLength({ max: 200 }),
    body('class').optional().isString().trim().isLength({ max: 20 }),
    body('interests').optional().isArray({ max: 10 }),
    body('company').optional().isString().trim().isLength({ max: 200 }),
    body('position').optional().isString().trim().isLength({ max: 100 }),
    body('domain').optional().isString().trim().isLength({ max: 100 }),
    body('website').optional().isURL(),
    body('experienceYears').optional().isInt({ min: 0, max: 60 }),
  ],
  validate,
  async (req: Request, res: Response) => {
    try {
      const userId = req.user!.sub;
      const role = req.user!.role as Role;

      let updated;
      if (role === Role.ELEV) {
        const { firstName, lastName, school, class: cls, city, bio, interests } = req.body as {
          firstName?: string; lastName?: string; school?: string; class?: string;
          city?: string; bio?: string; interests?: string[];
        };
        updated = await updateElevProfile({ userId, firstName, lastName, school, class: cls, city, bio, interests });
      } else {
        const { firstName, lastName, company, position, domain, website, bioMentor, experienceYears } = req.body as {
          firstName?: string; lastName?: string; company?: string; position?: string;
          domain?: string; website?: string; bioMentor?: string; experienceYears?: number;
        };
        updated = await updateAntreprenorProfile({ userId, firstName, lastName, company, position, domain, website, bioMentor, experienceYears });
      }

      res.json(updated);
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// POST /profiles/me/avatar — upload avatar
// ─────────────────────────────────────────────
router.post(
  '/me/avatar',
  uploadLimiter,
  uploadAvatar.single('avatar'),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) { res.status(400).json({ error: 'Niciun fișier primit.' }); return; }

      const uploaded = await cloudinary.uploader.upload(
        `data:${file.mimetype};base64,${file.buffer.toString('base64')}`,
        {
          folder: 'avatars',
          resource_type: 'image',
          transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto', fetch_format: 'auto' }],
        },
      );

      const userId = req.user!.sub;
      const role = req.user!.role as Role;
      if (role === Role.ELEV) {
        await updateElevProfile({ userId, avatarUrl: uploaded.secure_url });
      } else {
        await updateAntreprenorProfile({ userId, avatarUrl: uploaded.secure_url });
      }

      res.json({ avatarUrl: uploaded.secure_url });
    } catch (err) { handleError(err, res); }
  },
);

// ─────────────────────────────────────────────
// GET /profiles/:id — profil public (auto-detectare rol)
// ─────────────────────────────────────────────
router.get(
  '/:id',
  [param('id').isUUID()],
  validate,
  async (req: Request, res: Response) => {
    try {
      const targetId = req.params['id'] as string;
      const viewerId = req.user!.sub;

      // Detectăm rolul utilizatorului țintă
      const target = await (await import('../lib/prisma.js')).prisma.user.findUnique({
        where: { id: targetId },
        select: { role: true },
      });
      if (!target) { res.status(404).json({ error: 'Utilizator negăsit.' }); return; }

      const profile = target.role === Role.ELEV
        ? await getPublicElevProfile(targetId, viewerId)
        : await getPublicAntreprenorProfile(targetId, viewerId);

      res.json({ ...profile, targetRole: target.role });
    } catch (err) { handleError(err, res); }
  },
);

export default router;
