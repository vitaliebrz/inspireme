import { ModerationLevel, Role, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sendAccountWarningEmail, createNotification } from './notifications.service.js';

// ─────────────────────────────────────────────
// DASHBOARD STATISTICI
// ─────────────────────────────────────────────

export async function getDashboardStats() {
  const [users, ideas, activeGiveaways, pendingReports, collaborations, subscriptions] = await Promise.all([
    prisma.user.count({ where: { isDeleted: false } }),
    prisma.idea.count(),
    prisma.giveaway.count({ where: { status: 'ACTIVE' } }),
    prisma.report.count({ where: { status: 'PENDING' } }),
    prisma.collaboration.count({ where: { confirmedAt: { not: null } } }),
    prisma.subscription.count({ where: { currentPeriodEnd: { gt: new Date() }, cancelledAt: null } }),
  ]);

  const roleBreakdown = await prisma.user.groupBy({
    by: ['role'],
    where: { isDeleted: false },
    _count: true,
  });

  const planBreakdown = await prisma.user.groupBy({
    by: ['plan'],
    where: { isDeleted: false },
    _count: true,
  });

  return {
    users, ideas, activeGiveaways, pendingReports, collaborations, subscriptions,
    roleBreakdown: roleBreakdown.map((r) => ({ role: r.role, count: r._count })),
    planBreakdown: planBreakdown.map((p) => ({ plan: p.plan, count: p._count })),
  };
}

// ─────────────────────────────────────────────
// GESTIONARE UTILIZATORI
// ─────────────────────────────────────────────

export async function getUsers({
  search, role, page = 1,
}: { search?: string; role?: Role; page?: number }) {
  const PAGE = 20;
  const skip = (page - 1) * PAGE;

  const where = {
    isDeleted: false,
    ...(role ? { role } : {}),
    ...(search ? {
      OR: [
        { email: { contains: search, mode: 'insensitive' as const } },
        { profileElev: { OR: [{ firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] } },
        { profileAntreprenor: { OR: [{ firstName: { contains: search, mode: 'insensitive' as const } }, { lastName: { contains: search, mode: 'insensitive' as const } }] } },
      ],
    } : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: PAGE,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, role: true, plan: true, isSuspended: true, createdAt: true, lastLogin: true,
        profileElev: { select: { firstName: true, lastName: true } },
        profileAntreprenor: { select: { firstName: true, lastName: true, company: true } },
        _count: { select: { ideas: true, reportsSubmitted: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return { users, total, page, pages: Math.ceil(total / PAGE) };
}

// ─────────────────────────────────────────────
// MODERARE RAPOARTE
// ─────────────────────────────────────────────

export async function getPendingReports() {
  return prisma.report.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, contentType: true, contentId: true, reason: true, status: true, createdAt: true,
      reporter: {
        select: { id: true, profileElev: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  action: 'DISMISS' | 'AVERTISMENT' | 'ELIMINARE_CONTINUT' | 'SUSPENDARE_CONT',
  targetUserId?: string,
  reason?: string,
) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw Object.assign(new Error('Raport negăsit.'), { status: 404 });

  await prisma.report.update({
    where: { id: reportId },
    data: { status: 'RESOLVED' },
  });

  if (action === 'DISMISS') return { success: true, action };

  if (!targetUserId || !reason) {
    throw Object.assign(new Error('targetUserId și reason sunt necesare pentru acțiuni de moderare.'), { status: 400 });
  }

  const level = action as ModerationLevel;

  await prisma.moderationAction.create({
    data: {
      adminId,
      targetId: targetUserId,
      level,
      reason,
      contentRef: `${report.contentType}:${report.contentId}`,
    },
  });

  if (level === ModerationLevel.ELIMINARE_CONTINUT && report.contentType === 'IDEA') {
    await prisma.idea.update({
      where: { id: report.contentId },
      data: { visibility: 'PRIVAT' },
    });
  }

  if (level === ModerationLevel.SUSPENDARE_CONT) {
    await prisma.user.update({
      where: { id: targetUserId },
      data: { isSuspended: true, suspendedAt: new Date(), suspendReason: reason },
    });
  }

  return { success: true, action };
}

// ─────────────────────────────────────────────
// CONȚINUT BLOCAT (auto la 3 rapoarte)
// ─────────────────────────────────────────────

export async function getBlockedContent() {
  return prisma.blockedContent.findMany({
    orderBy: { hiddenAt: 'desc' },
    select: {
      id: true, reason: true, hiddenAt: true,
      idea: { select: { id: true, title: true, userId: true } },
    },
  });
}

export async function unblockContent(ideaId: string) {
  await prisma.blockedContent.delete({ where: { ideaId } });
  return { success: true };
}

// ─────────────────────────────────────────────
// SUSPENDARE / DESUSPENDARE UTILIZATOR
// ─────────────────────────────────────────────

export async function suspendUser(targetId: string, adminId: string, reason: string) {
  await prisma.user.update({
    where: { id: targetId },
    data: { isSuspended: true, suspendedAt: new Date(), suspendReason: reason },
  });
  await prisma.moderationAction.create({
    data: { adminId, targetId, level: ModerationLevel.SUSPENDARE_CONT, reason },
  });
  return { success: true };
}

export async function unsuspendUser(targetId: string) {
  await prisma.user.update({
    where: { id: targetId },
    data: { isSuspended: false, suspendedAt: null, suspendReason: null },
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// ȘTERGERE UTILIZATOR (soft delete + anonimizare GDPR)
// ─────────────────────────────────────────────

export async function deleteUser(targetId: string, adminId?: string) {
  if (adminId && targetId === adminId) {
    throw Object.assign(new Error('Nu poți șterge propriul cont de admin.'), { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: targetId } });
  if (!user) throw Object.assign(new Error('Utilizatorul nu există.'), { status: 404 });
  if (user.isDeleted) throw Object.assign(new Error('Contul a fost deja șters.'), { status: 400 });

  // Anonimizare GDPR: email înlocuit cu hash, datele personale șterse
  const anonEmail = `deleted_${targetId.slice(0, 8)}@deleted.invalid`;

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: { isDeleted: true, deletedAt: new Date(), email: anonEmail, isSuspended: true },
    }),
    ...(user.role === 'ELEV' ? [
      prisma.profileElev.updateMany({
        where: { userId: targetId },
        data: { firstName: 'Utilizator', lastName: 'Șters', bio: null, school: null, city: null, avatarUrl: null, interests: [] },
      }),
    ] : [
      prisma.profileAntreprenor.updateMany({
        where: { userId: targetId },
        data: { firstName: 'Utilizator', lastName: 'Șters', bioMentor: null, website: null, avatarUrl: null },
      }),
    ]),
  ]);

  return { success: true };
}

// ─────────────────────────────────────────────
// JOB ZILNIC — avertismente + ștergere conturi inactive (GDPR)
// Activitatea unui cont e dată de lastActivity (fallback createdAt dacă nu s-a logat niciodată)
// ─────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

async function warnInactiveUsers(minDaysInactive: number, daysUntilDelete: number) {
  const from = new Date(Date.now() - (minDaysInactive + 1) * DAY_MS);
  const to = new Date(Date.now() - minDaysInactive * DAY_MS);

  const users = await prisma.user.findMany({
    where: {
      isDeleted: false,
      OR: [
        { lastActivity: { gte: from, lt: to } },
        { lastActivity: null, createdAt: { gte: from, lt: to } },
      ],
    },
    select: { id: true, email: true },
  });

  for (const u of users) {
    sendAccountWarningEmail(u.email, daysUntilDelete).catch(() => {});
    // Notificare in-app suplimentară — vizibilă la următoarea logare
    createNotification({
      userId: u.id,
      type: NotificationType.ACCOUNT_WARNING,
      title: 'Cont inactiv — risc de ștergere',
      body: `Contul tău va fi șters automat în ${daysUntilDelete} zile dacă rămâne inactiv. Loghează-te pentru a-l păstra.`,
      data: {},
    }).catch(() => {});
  }
}

export async function runInactivityJob(): Promise<void> {
  // Avertismente la 330 și 354 zile inactivitate (35, respectiv 11 zile până la ștergere)
  await warnInactiveUsers(330, 35);
  await warnInactiveUsers(354, 11);

  // Ștergere automată (soft delete + anonimizare) la 365 zile inactivitate
  const deleteThreshold = new Date(Date.now() - 365 * DAY_MS);
  const toDelete = await prisma.user.findMany({
    where: {
      isDeleted: false,
      OR: [
        { lastActivity: { lt: deleteThreshold } },
        { lastActivity: null, createdAt: { lt: deleteThreshold } },
      ],
    },
    select: { id: true },
  });

  for (const u of toDelete) {
    await deleteUser(u.id).catch((err) => console.error('[Scheduler] deleteUser inactiv:', err));
  }
}
