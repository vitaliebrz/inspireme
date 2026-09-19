import {
  Plan,
  IdeaVisibility,
  IdeaStatus,
  NotificationType,
  GiveawayStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis, REDIS_KEYS, REDIS_TTL } from '../lib/redis.js';
import { deleteAsset } from '../lib/cloudinary.js';
import { createNotification, sendIdeaPublishedEmail, sendIdeaFeedbackEmail } from './notifications.service.js';

// ─────────────────────────────────────────────
// DETECȚIE IDEI SIMILARE (pg_trgm)
// ─────────────────────────────────────────────

const SIMILARITY_THRESHOLD = 0.35;

export interface SimilarIdea {
  id: string;
  title: string;
  userId: string;
  authorName: string;
  similarity: number;
}

// Caută idei publice cu titlu similar via trigram similarity (extensie pg_trgm,
// index ideas_title_trgm_idx). Folosit atât la postare (avertisment soft de
// duplicat), cât și la raportarea unei idei ca duplicat (selectarea originalului).
export async function findSimilarIdeas(title: string, excludeIdeaId?: string): Promise<SimilarIdea[]> {
  const trimmed = title.trim();
  if (trimmed.length < 5) return [];

  const rows = await prisma.$queryRaw<{ id: string; title: string; userId: string; similarity: number }[]>(
    Prisma.sql`
      SELECT id, title, user_id AS "userId", similarity(title, ${trimmed}) AS similarity
      FROM ideas
      WHERE visibility = 'PUBLIC'
        AND similarity(title, ${trimmed}) > ${SIMILARITY_THRESHOLD}
        ${excludeIdeaId ? Prisma.sql`AND id != ${excludeIdeaId}` : Prisma.empty}
      ORDER BY similarity DESC
      LIMIT 5
    `,
  );
  if (rows.length === 0) return [];

  const authorIds = [...new Set(rows.map((r) => r.userId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, profileElev: { select: { firstName: true, lastName: true } } },
  });
  const nameById = new Map(
    authors.map((a) => [a.id, a.profileElev ? `${a.profileElev.firstName} ${a.profileElev.lastName}`.trim() : 'Utilizator']),
  );

  return rows.map((r) => ({ ...r, authorName: nameById.get(r.userId) ?? 'Utilizator' }));
}

// ─────────────────────────────────────────────
// CREARE IDEE
// ─────────────────────────────────────────────

interface CreateIdeaInput {
  userId: string;
  userEmail: string;
  userPlan: Plan;
  title: string;
  categories: string[];
  problem: string;
  solution: string;
  targetAudience?: string;
  tags?: string[];
  visibility?: IdeaVisibility;
}

export async function createIdea(input: CreateIdeaInput) {
  const { userId, userPlan } = input;

  // Plan Gratuit: max 1 idee
  if (userPlan === Plan.GRATUIT) {
    const count = await prisma.idea.count({ where: { userId, user: { isDeleted: false } } });
    if (count >= 1) {
      throw Object.assign(new Error('Plan Gratuit permite doar 1 idee. Upgradează la Pro pentru idei nelimitate.'), { status: 403 });
    }
  }

  const wordCount = [input.problem, input.solution, input.targetAudience ?? '']
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const idea = await prisma.idea.create({
    data: {
      userId,
      title: input.title,
      categories: input.categories,
      problem: input.problem,
      solution: input.solution,
      targetAudience: input.targetAudience ?? null,
      tags: input.tags ?? [],
      visibility: input.visibility ?? IdeaVisibility.PUBLIC,
      status: IdeaStatus.PUBLICAT,
      planAtPost: userPlan,
      wordCount,
      // Scor inițial: Pro +100 + recency completă (30). Jobul zilnic îl recalculează.
      score: (userPlan === Plan.PRO ? 100 : 0) + 30,
    },
    select: { id: true },
  });

  // Notificare + email confirmare publicare — non-blocking
  createNotification({
    userId,
    type: NotificationType.IDEA_PUBLISHED,
    title: 'Ideea ta a fost publicată! 🎉',
    body: `„${input.title}" e acum vizibilă în feed.`,
    data: { ideaId: idea.id },
  }).catch(() => {});

  sendIdeaPublishedEmail(input.userEmail, input.title, idea.id).catch(() => {});

  return idea;
}

// ─────────────────────────────────────────────
// ADĂUGARE IMAGINI
// ─────────────────────────────────────────────

interface AddIdeaImagesInput {
  ideaId: string;
  userId: string;
  images: { url: string; publicId: string }[];
}

export async function addIdeaImages({ ideaId, userId, images }: AddIdeaImagesInput) {
  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { userId: true, planAtPost: true } });
  if (!idea || idea.userId !== userId) throw Object.assign(new Error('Nu ai drept să modifici această idee.'), { status: 403 });

  const existing = await prisma.ideaImage.count({ where: { ideaId } });
  const maxImages = idea.planAtPost === Plan.PRO ? 10 : 3;
  if (existing + images.length > maxImages) {
    throw Object.assign(new Error(`Poți adăuga maxim ${maxImages} imagini (plan ${idea.planAtPost}).`), { status: 403 });
  }

  await prisma.ideaImage.createMany({
    data: images.map((img, i) => ({
      ideaId,
      url: img.url,
      publicId: img.publicId,
      order: existing + i,
    })),
  });
}

// ─────────────────────────────────────────────
// ADĂUGARE PDF
// ─────────────────────────────────────────────

interface AddIdeaPdfInput {
  ideaId: string;
  userId: string;
  url: string;
  publicId: string;
  filename: string;
  size: number;
}

export async function addIdeaPdf(input: AddIdeaPdfInput) {
  const idea = await prisma.idea.findUnique({ where: { id: input.ideaId }, select: { userId: true } });
  if (!idea || idea.userId !== input.userId) throw Object.assign(new Error('Nu ai drept să modifici această idee.'), { status: 403 });

  // Un singur PDF per idee: dacă există deja unul, îl ÎNLOCUIM (ștergem vechiul
  // din DB + Cloudinary) în loc să respingem upload-ul.
  const existing = await prisma.ideaPdf.findMany({
    where: { ideaId: input.ideaId },
    select: { id: true, publicId: true },
  });
  if (existing.length > 0) {
    await prisma.ideaPdf.deleteMany({ where: { ideaId: input.ideaId } });
    existing.forEach((p) => { if (p.publicId) deleteAsset(p.publicId, 'raw').catch(() => {}); });
  }

  await prisma.ideaPdf.create({
    data: {
      ideaId: input.ideaId,
      url: input.url,
      publicId: input.publicId,
      filename: input.filename,
      size: input.size,
    },
  });
}

export async function deleteIdeaPdf(ideaId: string, userId: string) {
  // Verificăm proprietarul prin relația idea.userId
  const pdfs = await prisma.ideaPdf.findMany({
    where: { ideaId, idea: { userId } },
    select: { id: true, publicId: true },
  });
  if (pdfs.length === 0) throw Object.assign(new Error('PDF-ul nu a fost găsit.'), { status: 404 });

  await prisma.ideaPdf.deleteMany({ where: { id: { in: pdfs.map((p) => p.id) } } });
  pdfs.forEach((p) => { if (p.publicId) deleteAsset(p.publicId, 'raw').catch(() => {}); });
}

// ─────────────────────────────────────────────
// VIZUALIZARE IDEE
// ─────────────────────────────────────────────

export async function getIdeaById(ideaId: string, viewerId: string) {
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: {
      id: true, title: true, categories: true, problem: true, solution: true,
      targetAudience: true, tags: true, visibility: true, status: true,
      planAtPost: true, viewCount: true, wordCount: true, createdAt: true, updatedAt: true,
      userId: true,
      user: {
        select: {
          id: true, plan: true,
          profileElev: {
            select: {
              firstName: true, lastName: true, avatarUrl: true, city: true, school: true, class: true,
            },
          },
        },
      },
      images: { orderBy: { order: 'asc' }, select: { id: true, url: true, order: true } },
      pdfs: { select: { id: true, url: true, filename: true, size: true } },
      _count: { select: { feedbackList: true, connectionRequests: true } },
      // Tot feedback-ul lăsat pe idee, vizibil oricui vede ideea (proprietar,
      // alți mentori, elevi). Includem autorul pentru afișare; antreprenorul autor
      // își recunoaște propriul feedback după antreprenorId (pentru editare).
      feedbackList: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, antreprenorId: true, ratingGeneral: true, ratingOriginalitate: true,
          ratingViabilitate: true, ratingPrezentare: true, ratingPotential: true,
          comment: true, interestedInCollab: true, createdAt: true,
          antreprenor: {
            select: {
              id: true,
              profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
            },
          },
        },
      },
    },
  });

  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });

  // Idee privată — vizibil doar elevului
  if (idea.visibility === IdeaVisibility.PRIVAT && idea.userId !== viewerId) {
    throw Object.assign(new Error('Această idee este privată.'), { status: 403 });
  }

  // Incrementăm view_count dacă nu e proprietarul + deduplicare Redis (1 view/oră per user)
  const isOwner = idea.userId === viewerId;
  let counted = false;
  if (!isOwner) {
    const viewKey = REDIS_KEYS.ideaView(viewerId, ideaId);
    const alreadyViewed = await redis.get(viewKey).catch(() => null);
    if (!alreadyViewed) {
      await redis.set(viewKey, '1', { ex: REDIS_TTL.ideaView }).catch(() => null);
      prisma.idea.update({
        where: { id: ideaId },
        data: { viewCount: { increment: 1 } },
      }).catch((err) => console.error('[viewCount] increment failed:', err));
      // Înregistrăm și evenimentul (pentru analitica pe zile) — SQL raw, non-blocant
      prisma.$executeRawUnsafe(
        `INSERT INTO idea_views (idea_id, viewer_id) VALUES ($1, $2)`,
        ideaId, viewerId,
      ).catch(() => {});
      counted = true;
    }
  }

  // Cerere de conectare existentă de la viewer
  const connectionRequest = await prisma.connectionRequest.findFirst({
    where: { fromUserId: viewerId, ideaId },
    select: { id: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return {
    ...idea,
    viewCount: counted ? idea.viewCount + 1 : idea.viewCount,
    connectionRequest,
  };
}

// ─────────────────────────────────────────────
// ACTUALIZARE IDEE
// ─────────────────────────────────────────────

interface UpdateIdeaInput {
  ideaId: string;
  userId: string;
  title?: string;
  categories?: string[];
  problem?: string;
  solution?: string;
  targetAudience?: string;
  tags?: string[];
  visibility?: IdeaVisibility;
  status?: IdeaStatus;
}

export async function updateIdea(input: UpdateIdeaInput) {
  const idea = await prisma.idea.findUnique({
    where: { id: input.ideaId },
    select: { userId: true, user: { select: { plan: true } } },
  });
  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });
  if (idea.userId !== input.userId) throw Object.assign(new Error('Nu ai drept să modifici această idee.'), { status: 403 });

  // Planul Gratuit permite o singură idee publică. Dacă userul a revenit la Gratuit
  // (ex. anulare abonament) și ideile în plus au devenit private, nu le poate face
  // publice din nou decât cu un abonament Pro activ.
  if (input.visibility === IdeaVisibility.PUBLIC && idea.user.plan === Plan.GRATUIT) {
    const otherPublicCount = await prisma.idea.count({
      where: { userId: input.userId, visibility: IdeaVisibility.PUBLIC, id: { not: input.ideaId } },
    });
    if (otherPublicCount >= 1) {
      throw Object.assign(
        new Error('Cu planul Gratuit poți avea o singură idee publică. Treci la Pro ca să faci publice mai multe idei.'),
        { status: 403 },
      );
    }
  }

  const updateData: Prisma.IdeaUpdateInput = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.categories !== undefined) updateData.categories = input.categories;
  if (input.problem !== undefined) updateData.problem = input.problem;
  if (input.solution !== undefined) updateData.solution = input.solution;
  if (input.targetAudience !== undefined) updateData.targetAudience = input.targetAudience;
  if (input.tags !== undefined) updateData.tags = input.tags;
  if (input.visibility !== undefined) updateData.visibility = input.visibility;
  if (input.status !== undefined) updateData.status = input.status;

  // Recalculăm wordCount dacă s-a schimbat textul
  if (input.problem || input.solution) {
    const existing = await prisma.idea.findUnique({
      where: { id: input.ideaId },
      select: { problem: true, solution: true, targetAudience: true },
    });
    if (existing) {
      const wordCount = [
        input.problem ?? existing.problem,
        input.solution ?? existing.solution,
        input.targetAudience ?? existing.targetAudience ?? '',
      ].join(' ').trim().split(/\s+/).filter(Boolean).length;
      updateData.wordCount = wordCount;
    }
  }

  return prisma.idea.update({
    where: { id: input.ideaId },
    data: updateData,
    select: { id: true, status: true, visibility: true, updatedAt: true },
  });
}

// ─────────────────────────────────────────────
// ȘTERGERE IDEE
// ─────────────────────────────────────────────

export async function deleteIdea(ideaId: string, userId: string) {
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: {
      userId: true,
      images: { select: { publicId: true } },
      pdfs: { select: { publicId: true } },
    },
  });
  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });
  if (idea.userId !== userId) throw Object.assign(new Error('Nu ai drept să ștergi această idee.'), { status: 403 });

  // ─── Protecție „idee angajată" ───────────────────────────────────────────
  // O idee care a produs valoare (conectare, colaborare, giveaway) NU poate fi
  // ștearsă. Motive: (1) păstrează istoricul (câștigător giveaway, colaborări);
  // (2) previne abuzul planului Gratuit — postezi o idee, te conectezi cu un
  // antreprenor, ștergi ideea și postezi alta ca să ocolești limita de 1 idee.

  // 1. Conectare acceptată prin această idee
  const acceptedConnection = await prisma.connectionRequest.findFirst({
    where: { ideaId, status: 'ACCEPTED' },
    select: { id: true },
  });
  if (acceptedConnection) {
    throw Object.assign(
      new Error('Nu poți șterge o idee prin care te-ai conectat cu un antreprenor.'),
      { status: 409 },
    );
  }

  // 2. Colaborare pe această idee
  const collaboration = await prisma.collaboration.findFirst({
    where: { ideaId },
    select: { id: true },
  });
  if (collaboration) {
    throw Object.assign(
      new Error('Nu poți șterge o idee care are o colaborare asociată.'),
      { status: 409 },
    );
  }

  // 3. Participare la giveaway (activ SAU finalizat; cele anulate nu blochează)
  const participations = await prisma.giveawayParticipant.findMany({
    where: { ideaId, giveaway: { status: { in: [GiveawayStatus.ACTIVE, GiveawayStatus.FINISHED] } } },
    select: { giveaway: { select: { status: true } } },
  });
  if (participations.length > 0) {
    const hasFinished = participations.some((p) => p.giveaway.status === GiveawayStatus.FINISHED);
    throw Object.assign(
      new Error(
        hasFinished
          ? 'Nu poți șterge o idee care a participat la un giveaway finalizat — istoricul giveaway-ului depinde de ea.'
          : 'Retrage-ți participarea din giveaway înainte de a șterge această idee.',
      ),
      { status: 409 },
    );
  }

  // Cascada Prisma șterge rândurile din DB; noi ștergem și fizic din Cloudinary
  await prisma.idea.delete({ where: { id: ideaId } });

  const imagePublicIds = idea.images.map((i) => i.publicId).filter((p): p is string => Boolean(p));
  const pdfPublicIds   = idea.pdfs.map((p) => p.publicId).filter((p): p is string => Boolean(p));

  imagePublicIds.forEach((pid) => deleteAsset(pid, 'image').catch(() => {}));
  pdfPublicIds.forEach((pid)   => deleteAsset(pid, 'raw').catch(() => {}));
}

// ─────────────────────────────────────────────
// IDEI ELEV (profilul propriu)
// ─────────────────────────────────────────────

export async function getMyIdeas(userId: string) {
  return prisma.idea.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, title: true, categories: true, status: true, visibility: true,
      planAtPost: true, viewCount: true, wordCount: true, createdAt: true,
      images: { take: 1, orderBy: { order: 'asc' }, select: { id: true, url: true } },
      pdfs: { take: 1, select: { id: true } },
      _count: { select: { feedbackList: true, connectionRequests: true } },
    },
  });
}

// ─────────────────────────────────────────────
// FEEDBACK (antreprenor → idee)
// ─────────────────────────────────────────────

export async function submitFeedback(
  ideaId: string,
  antreprenorId: string,
  ratingGeneral: number,
  comment?: string,
  interestedInCollab?: boolean,
) {
  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { id: true, userId: true, title: true } });
  if (!idea) throw Object.assign(new Error('Ideea nu a fost găsită.'), { status: 404 });
  if (idea.userId === antreprenorId) throw Object.assign(new Error('Nu poți da feedback propriei idei.'), { status: 403 });

  const feedback = await prisma.feedback.upsert({
    where: { antreprenorId_ideaId: { antreprenorId, ideaId } },
    create: {
      antreprenorId, ideaId,
      ratingGeneral,
      ratingOriginalitate: ratingGeneral,
      ratingViabilitate: ratingGeneral,
      ratingPrezentare: ratingGeneral,
      ratingPotential: ratingGeneral,
      comment: comment ?? null,
      interestedInCollab: interestedInCollab ?? false,
    },
    update: {
      ratingGeneral,
      ratingOriginalitate: ratingGeneral,
      ratingViabilitate: ratingGeneral,
      ratingPrezentare: ratingGeneral,
      ratingPotential: ratingGeneral,
      comment: comment ?? null,
      interestedInCollab: interestedInCollab ?? false,
      updatedAt: new Date(),
    },
    select: { id: true, ratingGeneral: true, comment: true, interestedInCollab: true, createdAt: true, updatedAt: true },
  });

  // Notificăm proprietarul ideii doar la PRIMUL feedback (create), nu la editări
  const isNewFeedback = feedback.createdAt.getTime() === feedback.updatedAt.getTime();
  if (isNewFeedback) {
    const [owner, antreprenor] = await Promise.all([
      prisma.user.findUnique({ where: { id: idea.userId }, select: { email: true } }),
      prisma.user.findUnique({
        where: { id: antreprenorId },
        select: { profileAntreprenor: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const ap = antreprenor?.profileAntreprenor;
    const fromName = ap ? `${ap.firstName} ${ap.lastName}`.trim() : 'Un antreprenor';

    createNotification({
      userId: idea.userId,
      type: NotificationType.IDEA_FEEDBACK,
      title: `${fromName} ți-a lăsat feedback`,
      body: `Ai primit feedback pe ideea „${idea.title}".`,
      data: { ideaId },
    }).catch(() => {});

    if (owner?.email) {
      sendIdeaFeedbackEmail(owner.email, idea.title, ideaId, fromName).catch(() => {});
    }
  }

  return feedback;
}

// ─────────────────────────────────────────────
// JOB ZILNIC — reset stadiu idee la inactivitate (spec: 30 zile fără mesaje)
// Idei în stadiul automat CONTACTAT ale căror conversații-origine sunt inactive
// > 30 zile revin la PUBLICAT. Stadiile manuale (IN_COLABORARE/REALIZAT) NU se ating.
// ─────────────────────────────────────────────

export async function resetInactiveIdeaStatuses(): Promise<void> {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const ideas = await prisma.idea.findMany({
    where: { status: IdeaStatus.CONTACTAT },
    select: {
      id: true, userId: true, title: true,
      originConversations: { select: { lastMessageAt: true, createdAt: true } },
    },
  });

  for (const idea of ideas) {
    // Fără conversații legate nu putem confirma inactivitatea → nu resetăm (conservator)
    if (idea.originConversations.length === 0) continue;

    // Cea mai recentă activitate din conversațiile legate de idee
    const lastActivity = idea.originConversations.reduce<Date | null>((max, c) => {
      const t = c.lastMessageAt ?? c.createdAt;
      return !max || t > max ? t : max;
    }, null);

    if (lastActivity && lastActivity < threshold) {
      await prisma.idea.update({ where: { id: idea.id }, data: { status: IdeaStatus.PUBLICAT } });
      createNotification({
        userId: idea.userId,
        type: NotificationType.IDEA_STATUS_RESET,
        title: 'Stadiul ideii a revenit la Publicat',
        body: `Conversațiile pentru „${idea.title}" par inactive. Stadiul ideii tale a revenit la Publicat.`,
        data: { ideaId: idea.id },
      }).catch(() => {});
    }
  }
}
