import {
  Plan,
  IdeaVisibility,
  EntrepreneurStatus,
  GiveawayStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis, REDIS_KEYS, REDIS_TTL } from '../lib/redis.js';

const PAGE_SIZE = 12;

interface FeedIdeiOptions {
  userId: string;
  category?: string;
  cursor?: string;
}

interface FeedAntreprenoriOptions {
  userId: string;
  cursor?: string;
}

// Recalculează scorul persistat al TUTUROR ideilor — rulat de jobul zilnic.
// Formula: REALIZAT → penalizare masivă (mereu la coadă); Pro +100; recency
// (max 30, scade cu vârsta); engagement (view_count). Un singur UPDATE SQL, eficient.
export async function recomputeIdeaScores(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    UPDATE "ideas" SET "score" =
      (CASE WHEN "status" = 'REALIZAT' THEN -10000 ELSE 0 END)
      + (CASE WHEN "plan_at_post" = 'PRO' THEN 100 ELSE 0 END)
      + GREATEST(0, 30 - EXTRACT(EPOCH FROM (now() - "created_at")) / 86400)
      + "view_count" * 0.01
  `);
}

// ─────────────────────────────────────────────
// FEED IDEI
// ─────────────────────────────────────────────

export async function getIdeasFeed(opts: FeedIdeiOptions) {
  const { userId, category, cursor } = opts;

  if (!cursor) {
    try {
      const cacheKey = REDIS_KEYS.feedCache(category ?? 'ALL', 'first');
      const cached = await redis.get<string>(cacheKey);
      if (cached) return JSON.parse(cached) as unknown;
    } catch {
      // Redis indisponibil — continuăm cu interogarea DB
    }
  }

  const blockedRows = await prisma.blockedUser.findMany({
    where: { blockerId: userId },
    select: { blockedId: true },
  });
  const blockedIds: string[] = blockedRows.map((r: { blockedId: string }) => r.blockedId);

  // Ordonare GLOBALĂ după scorul persistat (recalculat de jobul zilnic), cu
  // paginare cursor Prisma stabilă pe id. Fără sortare în memorie → fără idei
  // sărite/duplicate între pagini, iar „Pro first" e global, nu doar pe pagină.
  const where: Prisma.IdeaWhereInput = {
    visibility: IdeaVisibility.PUBLIC,
    user: { isDeleted: false, isSuspended: false, id: { notIn: blockedIds } },
    blockedContent: null,
    ...(category ? { categories: { has: category } } : {}),
  };

  const rows = await prisma.idea.findMany({
    where,
    take: PAGE_SIZE + 1,
    orderBy: [{ score: 'desc' }, { id: 'desc' }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, title: true, categories: true, problem: true,
      viewCount: true, status: true, planAtPost: true, createdAt: true, tags: true,
      user: {
        select: {
          id: true, plan: true,
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true, city: true } },
        },
      },
      images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
      _count: { select: { feedbackList: true, connectionRequests: true } },
    },
  });

  const hasNextPage = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]!.id : null;

  const result = { items, nextCursor, hasNextPage };

  if (!cursor) {
    try {
      const cacheKey = REDIS_KEYS.feedCache(category ?? 'ALL', 'first');
      await redis.set(cacheKey, JSON.stringify(result), { ex: REDIS_TTL.feed });
    } catch {
      // Redis indisponibil — rezultatul nu se cacheaza, continuăm
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// FEED ANTREPRENORI
// ─────────────────────────────────────────────

export async function getAntreprenoriFeed(opts: FeedAntreprenoriOptions) {
  const { userId, cursor } = opts;

  if (!cursor) {
    try {
      const cacheKey = REDIS_KEYS.feedCache('antreprenori', 'first');
      const cached = await redis.get<string>(cacheKey);
      if (cached) return JSON.parse(cached) as unknown;
    } catch {
      // Redis indisponibil — continuăm cu interogarea DB
    }
  }

  const blockedRows = await prisma.blockedUser.findMany({
    where: { blockerId: userId },
    select: { blockedId: true },
  });
  const blockedIds: string[] = blockedRows.map((r: { blockedId: string }) => r.blockedId);

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const d60 = new Date(now.getTime() - 60 * 86_400_000);

  const where: Prisma.UserWhereInput = {
    role: 'ANTREPRENOR',
    isDeleted: false,
    isSuspended: false,
    id: { notIn: [...blockedIds, userId] },
    profileAntreprenor: { isNot: null },
  };

  // Ordonare/paginare în DB după lastActivity (recent = mai activ), cu cursor
  // Prisma stabil pe id. Statusul dinamic (ACTIV/INACTIV/RETRAS) se calculează
  // doar pentru afișare — nu se mai sortează în memorie (înainte cursorul era ignorat).
  const rows = await prisma.user.findMany({
    where,
    take: PAGE_SIZE + 1,
    orderBy: [{ lastActivity: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true, plan: true, lastActivity: true, createdAt: true,
      profileAntreprenor: {
        select: {
          firstName: true, lastName: true, company: true, domain: true,
          position: true, bioMentor: true, avatarUrl: true, status: true, experienceYears: true,
        },
      },
      _count: { select: { collaborationsAsAntreprenor: true, giveawaysCreated: true } },
    },
  });

  const hasNextPage = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE).map((u) => {
    const la = u.lastActivity;
    const dynamicStatus: EntrepreneurStatus =
      la && la >= d30 ? EntrepreneurStatus.ACTIV
      : la && la >= d60 ? EntrepreneurStatus.INACTIV
      : EntrepreneurStatus.RETRAS;
    return { ...u, status: dynamicStatus };
  });

  const nextCursor = hasNextPage && items.length > 0 ? items[items.length - 1]!.id : null;

  const result = { items, nextCursor, hasNextPage };

  if (!cursor) {
    try {
      const cacheKey = REDIS_KEYS.feedCache('antreprenori', 'first');
      await redis.set(cacheKey, JSON.stringify(result), { ex: REDIS_TTL.feed });
    } catch {
      // Redis indisponibil — continuăm fără cache
    }
  }

  return result;
}

// ─────────────────────────────────────────────
// STATISTICI
// ─────────────────────────────────────────────

export async function getFeedStats() {
  try {
    const cached = await redis.get<string>('feed:stats');
    if (cached) return JSON.parse(cached) as unknown;
  } catch {
    // Redis indisponibil — continuăm cu interogarea DB
  }

  const [ideas, users, collabs, giveaways] = await Promise.all([
    prisma.idea.count({ where: { visibility: IdeaVisibility.PUBLIC, user: { isDeleted: false } } }),
    prisma.user.count({ where: { isDeleted: false, role: { not: 'ADMIN' } } }),
    prisma.collaboration.count({ where: { confirmedAt: { not: null } } }),
    prisma.giveaway.count({ where: { status: GiveawayStatus.ACTIVE } }),
  ]);

  const stats = { ideas, users, collabs, giveaways };
  try {
    await redis.set('feed:stats', JSON.stringify(stats), { ex: 300 });
  } catch {
    // Redis indisponibil — continuăm fără cache
  }
  return stats;
}
