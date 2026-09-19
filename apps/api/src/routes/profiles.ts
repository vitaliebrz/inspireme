import { Router, Request, Response } from 'express';
import { body, param } from 'express-validator';
import { Role } from '@prisma/client';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter, uploadLimiter } from '../middleware/rateLimiter.js';
import { uploadAvatar, compressToWebp } from '../middleware/upload.js';
import { cloudinary, deleteAsset, extractPublicId } from '../lib/cloudinary.js';
import {
  getMyProfile, updateElevProfile, updateAntreprenorProfile,
  getPublicElevProfile, getPublicAntreprenorProfile, getMyAnalytics,
} from '../services/profiles.service.js';

const router = Router();
router.use(authenticate);
router.use(generalLimiter);

type AppError = Error & { status?: number };
function handleError(err: unknown, res: Response) {
  console.error('[profiles]', err);
  const e = err as AppError;
  res.status(e.status ?? 500).json({ error: e.message ?? 'Eroare server' });
}

// ─────────────────────────────────────────────
// GET /profiles/me — profil propriu complet
// ─────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const role = req.user!.role as Role;

    let profile;
    if (role === Role.ELEV) {
      profile = await getPublicElevProfile(userId, userId);
    } else if (role === Role.ANTREPRENOR) {
      profile = await getPublicAntreprenorProfile(userId, userId);
    } else {
      profile = await getMyProfile(userId, role);
    }

    res.json({ ...profile, targetRole: role, email: req.user!.email });
  } catch (err) { handleError(err, res); }
});

// GET /profiles/me/analytics — vizualizări pe ultimele 7 zile (idei proprii)
router.get('/me/analytics', async (req: Request, res: Response) => {
  try {
    const data = await getMyAnalytics(req.user!.sub);
    res.json(data);
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
    body('username').optional({ nullable: true }).isString().trim()
      .matches(/^[a-zA-Z0-9_]{3,30}$/).withMessage('Username: 3-30 caractere, doar litere/cifre/underscore.'),
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
        const { firstName, lastName, username, school, class: cls, city, bio, interests } = req.body as {
          firstName?: string; lastName?: string; username?: string; school?: string; class?: string;
          city?: string; bio?: string; interests?: string[];
        };
        updated = await updateElevProfile({ userId, firstName, lastName, username, school, class: cls, city, bio, interests });
      } else {
        const { firstName, lastName, username, company, position, domain, website, bioMentor, experienceYears } = req.body as {
          firstName?: string; lastName?: string; username?: string; company?: string; position?: string;
          domain?: string; website?: string; bioMentor?: string; experienceYears?: number;
        };
        updated = await updateAntreprenorProfile({ userId, firstName, lastName, username, company, position, domain, website, bioMentor, experienceYears });
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

      const userId = req.user!.sub;
      const role = req.user!.role as Role;

      // Citim avatarUrl-ul curent înainte de upload
      const existing = await getMyProfile(userId, role);
      const oldAvatarUrl =
        role === Role.ELEV
          ? (existing as { profileElev?: { avatarUrl?: string | null } })?.profileElev?.avatarUrl
          : (existing as { profileAntreprenor?: { avatarUrl?: string | null } })?.profileAntreprenor?.avatarUrl;

      const webpBuffer = await compressToWebp(file.buffer, { width: 400, height: 400, quality: 85 });
      const uploaded = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'avatars', resource_type: 'image', fetch_format: 'auto', quality: 'auto' },
          (err, result) => {
            if (err || !result) return reject(err ?? new Error('Upload avatar eșuat'));
            resolve(result as { secure_url: string; public_id: string });
          },
        ).end(webpBuffer);
      });

      if (role === Role.ELEV) {
        await updateElevProfile({ userId, avatarUrl: uploaded.secure_url });
      } else {
        await updateAntreprenorProfile({ userId, avatarUrl: uploaded.secure_url });
      }

      // Ștergem avatarul vechi din Cloudinary după ce DB-ul e actualizat
      if (oldAvatarUrl) {
        const oldPublicId = extractPublicId(oldAvatarUrl);
        if (oldPublicId) deleteAsset(oldPublicId, 'image').catch(() => {});
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
