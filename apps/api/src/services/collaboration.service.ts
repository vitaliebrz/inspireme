import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createNotification } from './notifications.service.js';

// ─────────────────────────────────────────────
// LISTARE COLABORĂRI
// ─────────────────────────────────────────────

export async function getMyCollaborations(userId: string) {
  return prisma.collaboration.findMany({
    where: { OR: [{ elevId: userId }, { antreprenorId: userId }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      confirmedByElev: true,
      confirmedByAntreprenor: true,
      confirmedAt: true,
      createdAt: true,
      idea: { select: { id: true, title: true, categories: true } },
      elev: {
        select: {
          id: true,
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
      antreprenor: {
        select: {
          id: true,
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// INIȚIERE COLABORARE DIN CONVERSAȚIE EXISTENTĂ
// ─────────────────────────────────────────────

export async function getConversationIdeas(conversationId: string, userId: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      participantAId: true, participantBId: true,
      participantA: { select: { role: true } },
      participantB: { select: { role: true } },
    },
  });
  if (!conv) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (conv.participantAId !== userId && conv.participantBId !== userId) {
    throw Object.assign(new Error('Nu faci parte din această conversație.'), { status: 403 });
  }

  const elevId = conv.participantA.role === 'ELEV' ? conv.participantAId : conv.participantBId;
  const antreprenorId = conv.participantA.role === 'ANTREPRENOR' ? conv.participantAId : conv.participantBId;

  if (elevId === antreprenorId) return []; // ambii același rol → nu e o conv elev-antreprenor

  const requests = await prisma.connectionRequest.findMany({
    where: {
      fromUserId: antreprenorId,
      toUserId: elevId,
      status: 'ACCEPTED',
      ideaId: { not: null },
    },
    select: { ideaId: true, idea: { select: { id: true, title: true, categories: true } } },
    distinct: ['ideaId'],
    orderBy: { createdAt: 'asc' },
  });

  const collabs = await prisma.collaboration.findMany({
    where: { elevId, antreprenorId },
    select: { id: true, ideaId: true, confirmedByElev: true, confirmedByAntreprenor: true, confirmedAt: true },
  });
  const collabByIdeaId = new Map(collabs.map((c) => [c.ideaId, c]));

  const investments = await prisma.investmentHistory.findMany({
    where: {
      antreprenorId,
      ideaId: { in: requests.map((r) => r.ideaId!).filter(Boolean) },
      status: { in: ['NECONFIRMAT', 'ACTIV', 'IN_NEGOCIERE'] },
    },
    select: { id: true, ideaId: true, status: true, amountDescription: true },
  });
  const investByIdeaId = new Map(investments.map((i) => [i.ideaId, i]));

  return requests
    .filter((r) => r.idea && r.ideaId)
    .map((r) => ({
      idea: r.idea!,
      collaboration: collabByIdeaId.get(r.ideaId!) ?? null,
      investment: investByIdeaId.get(r.ideaId!) ?? null,
    }));
}

export async function initiateCollaboration(conversationId: string, userId: string, ideaId?: string) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      participantAId: true,
      participantBId: true,
      participantA: { select: { id: true, role: true } },
      participantB: { select: { id: true, role: true } },
    },
  });

  if (!conv) throw Object.assign(new Error('Conversația nu a fost găsită.'), { status: 404 });
  if (conv.participantAId !== userId && conv.participantBId !== userId) {
    throw Object.assign(new Error('Nu faci parte din această conversație.'), { status: 403 });
  }

  // Determinăm cine e elevul și cine e antreprenorul din conversație
  const elevParticipant = conv.participantA.role === 'ELEV' ? conv.participantA : conv.participantB;
  const antreprenorParticipant = conv.participantA.role === 'ANTREPRENOR' ? conv.participantA : conv.participantB;

  if (elevParticipant.role !== 'ELEV' || antreprenorParticipant.role !== 'ANTREPRENOR') {
    throw Object.assign(new Error('Colaborarea necesită un elev și un antreprenor.'), { status: 400 });
  }

  let targetIdeaId = ideaId ?? null;
  if (!targetIdeaId) {
    // Cea mai recentă cerere ACCEPTATĂ între aceștia cu idee asociată
    const latestRequest = await prisma.connectionRequest.findFirst({
      where: {
        OR: [
          { fromUserId: antreprenorParticipant.id, toUserId: elevParticipant.id },
          { fromUserId: elevParticipant.id, toUserId: antreprenorParticipant.id },
        ],
        status: 'ACCEPTED',
        ideaId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { ideaId: true },
    });
    targetIdeaId = latestRequest?.ideaId ?? null;
  }

  if (!targetIdeaId) throw Object.assign(new Error('Nu există nicio cerere acceptată cu idee asociată.'), { status: 400 });

  const existing = await prisma.collaboration.findFirst({
    where: { elevId: elevParticipant.id, antreprenorId: antreprenorParticipant.id, ideaId: targetIdeaId },
  });
  if (existing) return existing;

  return prisma.collaboration.create({
    data: { elevId: elevParticipant.id, antreprenorId: antreprenorParticipant.id, ideaId: targetIdeaId },
    select: {
      id: true, confirmedByElev: true, confirmedByAntreprenor: true,
      confirmedAt: true, elevId: true, antreprenorId: true,
      idea: { select: { id: true, title: true, categories: true } },
      elev: { select: { id: true, profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } } } },
      antreprenor: { select: { id: true, profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } } } },
    },
  });
}

// ─────────────────────────────────────────────
// CONFIRMARE COLABORARE
// ─────────────────────────────────────────────

export async function confirmCollaboration(collaborationId: string, userId: string) {
  const collab = await prisma.collaboration.findUnique({
    where: { id: collaborationId },
    select: {
      id: true, elevId: true, antreprenorId: true, ideaId: true,
      confirmedByElev: true, confirmedByAntreprenor: true, confirmedAt: true,
    },
  });

  if (!collab) throw Object.assign(new Error('Colaborarea nu a fost găsită.'), { status: 404 });
  if (collab.confirmedAt) throw Object.assign(new Error('Colaborarea este deja confirmată.'), { status: 409 });

  const isElev = collab.elevId === userId;
  const isAntreprenor = collab.antreprenorId === userId;
  if (!isElev && !isAntreprenor) {
    throw Object.assign(new Error('Nu faci parte din această colaborare.'), { status: 403 });
  }
  if (isElev && collab.confirmedByElev) {
    throw Object.assign(new Error('Ai confirmat deja această colaborare.'), { status: 409 });
  }
  if (isAntreprenor && collab.confirmedByAntreprenor) {
    throw Object.assign(new Error('Ai confirmat deja această colaborare.'), { status: 409 });
  }

  const newConfirmedByElev = isElev ? true : collab.confirmedByElev;
  const newConfirmedByAntreprenor = isAntreprenor ? true : collab.confirmedByAntreprenor;
  const bothConfirmed = newConfirmedByElev && newConfirmedByAntreprenor;

  const updated = await prisma.collaboration.update({
    where: { id: collaborationId },
    data: {
      ...(isElev ? { confirmedByElev: true } : {}),
      ...(isAntreprenor ? { confirmedByAntreprenor: true } : {}),
      ...(bothConfirmed ? { confirmedAt: new Date() } : {}),
    },
    select: {
      id: true, confirmedByElev: true, confirmedByAntreprenor: true,
      confirmedAt: true, elevId: true, antreprenorId: true, ideaId: true,
    },
  });

  const otherId = isElev ? updated.antreprenorId : updated.elevId;

  if (bothConfirmed) {
    // Ambii au confirmat — notificăm ambele părți
    createNotification({
      userId,
      type: NotificationType.COLLAB_CONFIRMED,
      title: 'Colaborare confirmată! 🤝',
      body: 'Ambele părți au confirmat colaborarea.',
      data: { collaborationId, ideaId: updated.ideaId },
    }).catch(() => {});
    createNotification({
      userId: otherId,
      type: NotificationType.COLLAB_CONFIRMED,
      title: 'Colaborare confirmată! 🤝',
      body: 'Ambele părți au confirmat colaborarea.',
      data: { collaborationId, ideaId: updated.ideaId },
    }).catch(() => {});
  } else {
    // O parte a confirmat — notificăm cealaltă parte
    createNotification({
      userId: otherId,
      type: NotificationType.COLLAB_CONFIRM,
      title: 'Confirmare colaborare în așteptare',
      body: `${isElev ? 'Elevul' : 'Antreprenorul'} a confirmat colaborarea. Confirmă și tu!`,
      data: { collaborationId, ideaId: updated.ideaId },
    }).catch(() => {});
  }

  return updated;
}

// ─────────────────────────────────────────────
// JOB ZILNIC — reminder confirmare colaborare (spec: la 30 zile după conectare)
// Trimitem o singură dată per colaborare (reminderSentAt marchează livrarea).
// ─────────────────────────────────────────────

export async function remindPendingCollaborations(): Promise<void> {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const collabs = await prisma.collaboration.findMany({
    where: {
      confirmedAt: null,
      reminderSentAt: null,
      createdAt: { lt: threshold },
    },
    select: { id: true, elevId: true, antreprenorId: true, ideaId: true },
  });

  for (const c of collabs) {
    await prisma.collaboration.update({ where: { id: c.id }, data: { reminderSentAt: new Date() } });
    for (const uid of [c.elevId, c.antreprenorId]) {
      createNotification({
        userId: uid,
        type: NotificationType.COLLAB_CONFIRM,
        title: 'Confirmă colaborarea',
        body: 'Au trecut 30 de zile de la conectare. Confirmă dacă ați început o colaborare pentru această idee.',
        data: { collaborationId: c.id, ideaId: c.ideaId },
      }).catch(() => {});
    }
  }
}
