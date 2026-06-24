import {
  Plan,
  IdeaCategory,
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
  category?: IdeaCategory;
  cursor?: string;
}

interface FeedAntreprenoriOptions {
  userId: string;
  cursor?: string;
}

function encodeCursor(parts: string[]): string {
  return Buffer.from(parts.join('|')).toString('base64url');
}

function decodeCursorIdei(cursor: string) {
  try {
    const [planAtPost, createdAt, id] = Buffer.from(cursor, 'base64url').toString().split('|');
    if (!planAtPost || !createdAt || !id) return null;
    return { planAtPost: planAtPost as Plan, createdAt, id };
  } catch { return null; }
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

  const cur = cursor ? decodeCursorIdei(cursor) : null;

  const where: Prisma.IdeaWhereInput = {
    visibility: IdeaVisibility.PUBLIC,
    user: { isDeleted: false, isSuspended: false, id: { notIn: blockedIds } },
    blockedContent: null,
    ...(category ? { category } : {}),
    ...(cur
      ? {
          OR: [
            {
              planAtPost: cur.planAtPost,
              OR: [
                { createdAt: { lt: new Date(cur.createdAt) } },
                { createdAt: new Date(cur.createdAt), id: { lt: cur.id } },
              ],
            },
            ...(cur.planAtPost === Plan.PRO ? [{ planAtPost: Plan.GRATUIT }] : []),
          ],
        }
      : {}),
  };

  const rows = await prisma.idea.findMany({
    where,
    take: PAGE_SIZE + 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, title: true, category: true, problem: true,
      viewCount: true, status: true, planAtPost: true, createdAt: true, tags: true,
      user: {
        select: {
          plan: true,
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true, city: true } },
        },
      },
      images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
      _count: { select: { feedbackList: true, connectionRequests: true } },
    },
  });

  type IdeaRow = typeof rows[number];

  const scored: Array<IdeaRow & { _score: number }> = rows.map((idea: IdeaRow) => {
    const ageDays = (Date.now() - idea.createdAt.getTime()) / 86_400_000;
    const score =
      (idea.planAtPost === Plan.PRO ? 100 : 0) +
      Math.max(0, 30 - ageDays) +
      idea.viewCount * 0.01;
    return { ...idea, _score: score };
  });

  scored.sort((a: { _score: number }, b: { _score: number }) => b._score - a._score);

  const hasNextPage = scored.length > PAGE_SIZE;
  const items = scored.slice(0, PAGE_SIZE).map(({ _score: _, ...rest }: IdeaRow & { _score: number }) => rest);

  const last = items[items.length - 1];
  const nextCursor = hasNextPage && last
    ? encodeCursor([last.planAtPost, last.createdAt.toISOString(), last.id])
    : null;

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

  const rows = await prisma.user.findMany({
    where,
    take: PAGE_SIZE + 1,
    orderBy: [{ lastActivity: 'desc' }, { id: 'desc' }],
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

  type UserRow = typeof rows[number];

  type ScoredUser = UserRow & { dynamicStatus: EntrepreneurStatus; _score: number };

  const scored: ScoredUser[] = rows
    .filter((u: UserRow) => u.profileAntreprenor !== null)
    .map((u: UserRow) => {
      const la = u.lastActivity;
      const dynamicStatus: EntrepreneurStatus =
        la && la >= d30 ? EntrepreneurStatus.ACTIV
        : la && la >= d60 ? EntrepreneurStatus.INACTIV
        : EntrepreneurStatus.RETRAS;

      const score =
        (u.plan === Plan.PRO ? 50 : 0) +
        (dynamicStatus === EntrepreneurStatus.ACTIV ? 100
          : dynamicStatus === EntrepreneurStatus.INACTIV ? 30 : 0);

      return { ...u, dynamicStatus, _score: score };
    });

  scored.sort((a: ScoredUser, b: ScoredUser) => b._score - a._score);

  const hasNextPage = scored.length > PAGE_SIZE;
  const items = scored.slice(0, PAGE_SIZE).map(
    ({ _score: _, dynamicStatus, ...u }: ScoredUser) => ({ ...u, status: dynamicStatus }),
  );

  const last = items[items.length - 1];
  const nextCursor = hasNextPage && last
    ? encodeCursor([
        last.status,
        last.lastActivity?.toISOString() ?? 'null',
        last.id,
      ])
    : null;

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
