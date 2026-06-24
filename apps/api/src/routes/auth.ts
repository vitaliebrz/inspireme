import { Router, Request, Response, NextFunction } from 'express';
import { authLimiter } from '../middleware/rateLimiter.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerElevValidators,
  registerAntreprenorValidators,
  loginValidators,
  forgotPasswordValidators,
  resetPasswordValidators,
} from '../validators/auth.js';
import {
  registerElev,
  registerAntreprenor,
  login,
  refreshTokens,
  logout,
  forgotPassword,
  validateResetToken,
  resetPassword,
  confirmParentalConsent,
  rejectParentalConsent,
} from '../services/auth.service.js';

const router = Router();

// Express 5 tipizează params ca string | string[] — helper pentru siguranță
const p = (req: Request, name: string): string => {
  const v = req.params[name];
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
};

// POST /api/v1/auth/register/elev — AUTH-01
router.post(
  '/register/elev',
  authLimiter,
  registerElevValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await registerElev({
        firstName: req.body.firstName as string,
        lastName: req.body.lastName as string,
        email: req.body.email as string,
        password: req.body.password as string,
        isUnder16: req.body.isUnder16 === true || req.body.isUnder16 === 'true',
        parentEmail: req.body.parentEmail as string | undefined,
        school: req.body.school as string | undefined,
        class: req.body.class as string | undefined,
        city: req.body.city as string | undefined,
        bio: req.body.bio as string | undefined,
        interests: req.body.interests as string[] | undefined,
      });

      if ('pendingConsent' in result) {
        res.status(201).json({
          message: 'Cont creat! Am trimis un email părintelui tău pentru confirmare. Contul va fi activat după aprobare.',
          pendingConsent: true,
        });
        return;
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/register/antreprenor — AUTH-02
router.post(
  '/register/antreprenor',
  authLimiter,
  registerAntreprenorValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await registerAntreprenor({
        firstName: req.body.firstName as string,
        lastName: req.body.lastName as string,
        email: req.body.email as string,
        password: req.body.password as string,
        company: req.body.company as string | undefined,
        position: req.body.position as string | undefined,
        domain: req.body.domain as string,
        website: req.body.website as string | undefined,
        bioMentor: req.body.bioMentor as string | undefined,
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/login — AUTH-03
router.post(
  '/login',
  authLimiter,
  loginValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await login(
        req.body.email as string,
        req.body.password as string,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/refresh
router.post(
  '/refresh',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.body.refreshToken as string | undefined;
      if (!token) {
        res.status(400).json({ error: 'Refresh token lipsă.' });
        return;
      }
      const tokens = await refreshTokens(token);
      res.json(tokens);
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/logout
router.post(
  '/logout',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await logout(req.user!.sub);
      res.json({ message: 'Delogat cu succes.' });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/forgot-password — AUTH-04
router.post(
  '/forgot-password',
  authLimiter,
  forgotPasswordValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await forgotPassword(req.body.email as string);
      // Răspuns identic indiferent dacă emailul există sau nu (securitate)
      res.json({ message: 'Dacă emailul există în sistem, vei primi un link de resetare în câteva minute.' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/auth/reset-password/:token — validare token
router.get(
  '/reset-password/:token',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const valid = await validateResetToken(p(req, 'token'));
      if (!valid) {
        res.status(400).json({ error: 'Linkul a expirat sau a fost deja utilizat.' });
        return;
      }
      res.json({ valid: true });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/reset-password — AUTH-04
router.post(
  '/reset-password',
  resetPasswordValidators,
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await resetPassword(req.body.token as string, req.body.password as string);
      res.json({ message: 'Parola a fost schimbată. Poți intra în cont.' });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/parental-consent/:token/confirm — AUTH-05
router.post(
  '/parental-consent/:token/confirm',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await confirmParentalConsent(p(req, 'token'));
      res.json({ message: 'Contul copilului tău a fost activat cu succes pe InspireMe!' });
    } catch (err) {
      next(err);
    }
  },
);

// POST /api/v1/auth/parental-consent/:token/reject — AUTH-05
router.post(
  '/parental-consent/:token/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await rejectParentalConsent(p(req, 'token'));
      res.json({ message: 'Contul a fost șters conform solicitării tale.' });
    } catch (err) {
      next(err);
    }
  },
);

// GET /api/v1/auth/me — user curent (util pentru frontend)
router.get(
  '/me',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { sub, email, role, plan } = req.user!;
      res.json({ id: sub, email, role, plan });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
