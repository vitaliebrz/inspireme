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

// Rezumat per raport (batch, fără N+1): numele userului vizat + câte avertismente are
// + cele două idei implicate într-un raport de duplicat — ideea raportată (posibilul
// duplicat, contentId) și ideea originală indicată de reporter (relatedIdeaId).
// Fără titlul ideii raportate, admin vedea doar „despre <owner>" și titlul originalului,
// fără să știe la ce idee anume se referă raportul — de-aia le afișăm pe amândouă explicit.
async function withTargetSummary<T extends { contentType: string; contentId: string; relatedIdeaId?: string | null }>(reports: T[]) {
  if (reports.length === 0) {
    return reports.map((r) => ({
      ...r, targetName: null as string | null, warningCount: 0,
      reportedIdea: null as { id: string; title: string } | null,
      relatedIdea: null as { id: string; title: string } | null,
    }));
  }

  const ideaIds = reports.filter((r) => r.contentType === 'IDEA').map((r) => r.contentId);
  const msgIds = reports.filter((r) => r.contentType === 'MESSAGE').map((r) => r.contentId);
  const relatedIdeaIds = [...new Set(reports.map((r) => r.relatedIdeaId).filter((id): id is string => Boolean(id)))];
  const [ideas, msgs, relatedIdeas] = await Promise.all([
    ideaIds.length ? prisma.idea.findMany({ where: { id: { in: ideaIds } }, select: { id: true, userId: true, title: true } }) : [],
    msgIds.length ? prisma.message.findMany({ where: { id: { in: msgIds } }, select: { id: true, senderId: true } }) : [],
    relatedIdeaIds.length ? prisma.idea.findMany({ where: { id: { in: relatedIdeaIds } }, select: { id: true, title: true } }) : [],
  ]);
  const ideaOwner = new Map(ideas.map((i) => [i.id, i.userId]));
  const ideaById = new Map(ideas.map((i) => [i.id, { id: i.id, title: i.title }]));
  const msgSender = new Map(msgs.map((m) => [m.id, m.senderId]));
  const relatedIdeaById = new Map(relatedIdeas.map((i) => [i.id, i]));
  const targetOf = (r: { contentType: string; contentId: string }): string | null =>
    r.contentType === 'USER' ? r.contentId
    : r.contentType === 'IDEA' ? (ideaOwner.get(r.contentId) ?? null)
    : r.contentType === 'MESSAGE' ? (msgSender.get(r.contentId) ?? null)
    : null;

  const targetIds = [...new Set(reports.map(targetOf).filter((id): id is string => Boolean(id)))];
  const [users, warns] = await Promise.all([
    targetIds.length ? prisma.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true, profileElev: { select: { firstName: true, lastName: true } }, profileAntreprenor: { select: { firstName: true, lastName: true } } },
    }) : [],
    targetIds.length ? prisma.moderationAction.groupBy({ by: ['targetId'], where: { targetId: { in: targetIds }, level: 'AVERTISMENT' }, _count: { _all: true } }) : [],
  ]);
  const nameById = new Map(users.map((u) => {
    const p = u.profileElev ?? u.profileAntreprenor;
    return [u.id, p ? `${p.firstName} ${p.lastName}`.trim() : u.email];
  }));
  const warnById = new Map(warns.map((w) => [w.targetId, w._count._all]));

  return reports.map((r) => {
    const tid = targetOf(r);
    return {
      ...r,
      targetName: tid ? (nameById.get(tid) ?? null) : null,
      warningCount: tid ? (warnById.get(tid) ?? 0) : 0,
      reportedIdea: r.contentType === 'IDEA' ? (ideaById.get(r.contentId) ?? null) : null,
      relatedIdea: r.relatedIdeaId ? (relatedIdeaById.get(r.relatedIdeaId) ?? null) : null,
    };
  });
}

export async function getPendingReports() {
  const reports = await prisma.report.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, contentType: true, contentId: true, reason: true, status: true, createdAt: true, relatedIdeaId: true,
      reporter: {
        select: { id: true, profileElev: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  return withTargetSummary(reports);
}

// Istoric rapoarte rezolvate — cu acțiunea de moderare luată (dacă a fost una)
export async function getResolvedReports() {
  const reports = await prisma.report.findMany({
    where: { status: 'RESOLVED' },
    orderBy: { resolvedAt: 'desc' },
    take: 100,
    select: {
      id: true, contentType: true, contentId: true, reason: true, status: true,
      createdAt: true, resolvedAt: true, relatedIdeaId: true,
      reporter: {
        select: { id: true, profileElev: { select: { firstName: true, lastName: true } } },
      },
    },
  });
  if (reports.length === 0) return [];

  // Nivelul acțiunii de moderare per conținut (cea mai recentă) — pentru afișare
  const refs = [...new Set(reports.map((r) => `${r.contentType}:${r.contentId}`))];
  const actions = await prisma.moderationAction.findMany({
    where: { contentRef: { in: refs } },
    orderBy: { createdAt: 'desc' },
    select: { contentRef: true, level: true },
  });
  const actionByRef = new Map<string, string>();
  for (const a of actions) {
    if (a.contentRef && !actionByRef.has(a.contentRef)) actionByRef.set(a.contentRef, a.level);
  }

  const withAction = reports.map((r) => ({
    ...r,
    action: actionByRef.get(`${r.contentType}:${r.contentId}`) ?? 'DISMISS',
  }));
  return withTargetSummary(withAction);
}

// Detaliu raport — cine a raportat, cine e vizat, câte avertismente are userul
// vizat și istoricul lui de moderare (ce mesaje au dat adminii).
export async function getReportDetail(reportId: string) {
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: {
      id: true, contentType: true, contentId: true, reason: true, status: true,
      createdAt: true, resolvedAt: true, relatedIdeaId: true,
      reporter: {
        select: {
          id: true,
          profileElev: { select: { firstName: true, lastName: true } },
          profileAntreprenor: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
  if (!report) throw Object.assign(new Error('Raport negăsit.'), { status: 404 });

  // Userul vizat (proprietar idee / user raportat / expeditor mesaj)
  let targetId: string | null = null;
  let reportedIdea: { id: string; title: string } | null = null;
  if (report.contentType === 'USER') targetId = report.contentId;
  else if (report.contentType === 'IDEA') {
    const idea = await prisma.idea.findUnique({ where: { id: report.contentId }, select: { userId: true, title: true } });
    targetId = idea?.userId ?? null;
    if (idea) reportedIdea = { id: report.contentId, title: idea.title };
  } else if (report.contentType === 'MESSAGE') {
    const msg = await prisma.message.findUnique({ where: { id: report.contentId }, select: { senderId: true } });
    targetId = msg?.senderId ?? null;
  }

  const nameOf = (u: { profileElev: { firstName: string; lastName: string } | null; profileAntreprenor: { firstName: string; lastName: string } | null; email?: string } | null | undefined) => {
    const p = u?.profileElev ?? u?.profileAntreprenor;
    return p ? `${p.firstName} ${p.lastName}`.trim() : (u?.email ?? 'Utilizator');
  };

  let targetUser: { id: string; name: string; role: string; isSuspended: boolean } | null = null;
  let moderationHistory: { level: string; reason: string; adminName: string; createdAt: Date }[] = [];
  let warningCount = 0;
  let totalActions = 0;

  if (targetId) {
    const tu = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true, role: true, email: true, isSuspended: true,
        profileElev: { select: { firstName: true, lastName: true } },
        profileAntreprenor: { select: { firstName: true, lastName: true } },
      },
    });
    if (tu) targetUser = { id: tu.id, name: nameOf(tu), role: tu.role, isSuspended: tu.isSuspended };

    const actions = await prisma.moderationAction.findMany({
      where: { targetId },
      orderBy: { createdAt: 'desc' },
      select: { level: true, reason: true, createdAt: true, adminId: true },
    });
    totalActions = actions.length;
    warningCount = actions.filter((a) => a.level === 'AVERTISMENT').length;

    const adminIds = [...new Set(actions.map((a) => a.adminId))];
    const admins = adminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: {
            id: true, email: true,
            profileElev: { select: { firstName: true, lastName: true } },
            profileAntreprenor: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const adminById = new Map(admins.map((a) => [a.id, a]));
    moderationHistory = actions.map((a) => ({
      level: a.level,
      reason: a.reason,
      adminName: nameOf(adminById.get(a.adminId)),
      createdAt: a.createdAt,
    }));
  }

  // Ideea originală indicată de reporter, la un raport de duplicat
  const relatedIdea = report.relatedIdeaId
    ? await prisma.idea.findUnique({ where: { id: report.relatedIdeaId }, select: { id: true, title: true } })
    : null;

  return {
    report: { ...report, reporterName: nameOf(report.reporter) },
    targetUser,
    reportedIdea,
    relatedIdea,
    warningCount,
    totalActions,
    moderationHistory,
  };
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
    data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: adminId },
  });

  if (action === 'DISMISS') return { success: true, action };

  if (!reason) {
    throw Object.assign(new Error('Motivul este necesar pentru acțiuni de moderare.'), { status: 400 });
  }

  // Derivăm utilizatorul vizat din conținutul raportat (dacă nu e furnizat explicit):
  // USER → chiar contentId; IDEA → proprietarul ideii; MESSAGE → expeditorul.
  let resolvedTargetId = targetUserId;
  if (!resolvedTargetId) {
    if (report.contentType === 'USER') {
      resolvedTargetId = report.contentId;
    } else if (report.contentType === 'IDEA') {
      const idea = await prisma.idea.findUnique({ where: { id: report.contentId }, select: { userId: true } });
      resolvedTargetId = idea?.userId;
    } else if (report.contentType === 'MESSAGE') {
      const msg = await prisma.message.findUnique({ where: { id: report.contentId }, select: { senderId: true } });
      resolvedTargetId = msg?.senderId ?? undefined;
    }
  }
  if (!resolvedTargetId) {
    throw Object.assign(new Error('Nu am putut determina utilizatorul vizat de raport.'), { status: 400 });
  }

  const level = action as ModerationLevel;

  await prisma.moderationAction.create({
    data: {
      adminId,
      targetId: resolvedTargetId,
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
      where: { id: resolvedTargetId },
      data: { isSuspended: true, suspendedAt: new Date(), suspendReason: reason },
    });
  }

  // Notificăm utilizatorul vizat despre acțiunea de moderare. Dacă raportul indică o
  // idee originală (raport de duplicat), menționăm explicit despre ce idee e vorba —
  // asta e „avertizarea" cerută de flow-ul de duplicate, fără notificare dedicată nouă.
  const moderationTitles: Record<string, string> = {
    AVERTISMENT: 'Ai primit un avertisment',
    ELIMINARE_CONTINUT: 'Conținutul tău a fost eliminat',
    SUSPENDARE_CONT: 'Contul tău a fost suspendat',
  };
  let body = `Moderatori InspireMe: ${reason}`;
  if (report.relatedIdeaId) {
    const original = await prisma.idea.findUnique({ where: { id: report.relatedIdeaId }, select: { title: true } });
    if (original) body += ` Ideea ta a fost semnalată ca fiind similară cu „${original.title}".`;
  }
  createNotification({
    userId: resolvedTargetId,
    type: NotificationType.SYSTEM,
    title: moderationTitles[level] ?? 'Acțiune de moderare',
    body,
    data: {},
  }).catch(() => {});

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
