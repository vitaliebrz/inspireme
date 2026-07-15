import { Router, Request, Response } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generalLimiter } from '../middleware/rateLimiter.js';
import { prisma } from '../lib/prisma.js';

const router = Router();

router.use(authenticate);
router.use(generalLimiter);

// GET /search/users/suggestions — elevi cu care am interacționat (pentru modal creare grup)
router.get('/users/suggestions', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.sub;
    const excludeParam = (req.query['exclude'] as string) ?? '';
    const excludeIds = excludeParam.split(',').filter((id) => id.length > 0).concat([userId]);

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [{ participantAId: userId }, { participantBId: userId }],
        messages: { some: {} },
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: 30,
      select: {
        participantAId: true,
        participantBId: true,
        participantA: {
          select: {
            id: true,
            role: true,
            isDeleted: true,
            profileElev: {
              select: { firstName: true, lastName: true, username: true, avatarUrl: true, school: true, class: true, city: true },
            },
          },
        },
        participantB: {
          select: {
            id: true,
            role: true,
            isDeleted: true,
            profileElev: {
              select: { firstName: true, lastName: true, username: true, avatarUrl: true, school: true, class: true, city: true },
            },
          },
        },
      },
    });

    const seen = new Set<string>();
    const users: {
      id: string; role: string; username: string | null;
      firstName: string; lastName: string; avatarUrl: string | null;
      subtitle: string; city: string | null;
    }[] = [];

    for (const conv of conversations) {
      const other = conv.participantAId === userId ? conv.participantB : conv.participantA;
      if (other.role !== 'ELEV' || !other.profileElev || other.isDeleted || seen.has(other.id)) continue;
      if (excludeIds.includes(other.id)) continue;
      seen.add(other.id);
      const p = other.profileElev;
      users.push({
        id: other.id,
        role: 'ELEV',
        username: p.username,
        firstName: p.firstName,
        lastName: p.lastName,
        avatarUrl: p.avatarUrl,
        subtitle: [p.school, p.class].filter(Boolean).join(', '),
        city: p.city,
      });
    }

    res.json({ users });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /search/users?q=text&exclude=id1,id2 — caută elevi după username/nume (pentru modal grup)
router.get('/users', async (req: Request, res: Response) => {
  try {
    const q = ((req.query['q'] as string) ?? '').trim();
    if (q.length < 2) { res.json({ users: [] }); return; }

    const excludeIds = ((req.query['exclude'] as string) ?? '')
      .split(',')
      .filter((id) => id.length > 0)
      .concat([req.user!.sub]);

    const profiles = await prisma.profileElev.findMany({
      where: {
        userId: { notIn: excludeIds },
        user: { isDeleted: false, isSuspended: false },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      },
      take: 12,
      select: {
        userId: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        school: true,
        class: true,
        city: true,
      },
    });

    const users = profiles.map((p) => ({
      id: p.userId,
      role: 'ELEV',
      username: p.username,
      firstName: p.firstName,
      lastName: p.lastName,
      avatarUrl: p.avatarUrl,
      subtitle: [p.school, p.class].filter(Boolean).join(', '),
      city: p.city,
    }));

    res.json({ users });
  } catch {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// GET /search?q=termen
router.get(
  '/',
  [query('q').isString().trim().isLength({ min: 2, max: 100 })],
  validate,
  async (req: Request, res: Response) => {
    try {
      const q = (req.query['q'] as string).trim();

      const [ideas, users, giveaways] = await Promise.all([
        // Idei publice care conțin termenul în titlu sau problemă
        prisma.idea.findMany({
          where: {
            visibility: 'PUBLIC',
            user: { isDeleted: false },
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { problem: { contains: q, mode: 'insensitive' } },
            ],
          },
          select: { id: true, title: true, categories: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),

        // Utilizatori activi (elevi + antreprenori) după nume
        prisma.user.findMany({
          where: {
            isDeleted: false,
            isSuspended: false,
            role: { in: ['ELEV', 'ANTREPRENOR'] },
            OR: [
              {
                profileElev: {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
              {
                profileAntreprenor: {
                  OR: [
                    { firstName: { contains: q, mode: 'insensitive' } },
                    { lastName: { contains: q, mode: 'insensitive' } },
                    { company: { contains: q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          },
          select: {
            id: true,
            role: true,
            profileElev: { select: { firstName: true, lastName: true } },
            profileAntreprenor: { select: { firstName: true, lastName: true } },
          },
          take: 5,
        }),

        // Giveaway-uri active sau recente
        prisma.giveaway.findMany({
          where: {
            status: { not: 'CANCELLED' },
            title: { contains: q, mode: 'insensitive' },
          },
          select: { id: true, title: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      res.json({
        ideas: ideas.map((i) => ({
          id: i.id,
          title: i.title,
          categories: i.categories,
        })),
        users: users
          .map((u) => {
            const profile = u.profileElev ?? u.profileAntreprenor;
            if (!profile) return null;
            return {
              id: u.id,
              role: u.role,
              firstName: profile.firstName,
              lastName: profile.lastName,
            };
          })
          .filter(Boolean),
        giveaways: giveaways.map((g) => ({ id: g.id, title: g.title })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Eroare server' });
    }
  },
);

export default router;
