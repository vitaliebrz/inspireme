import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { createNotification } from './notifications.service.js';

// ─────────────────────────────────────────────
// PROPUNERE INVESTIȚIE DIRECTĂ (antreprenor)
// ─────────────────────────────────────────────

export async function proposeDirectInvestment(
  antreprenorId: string,
  ideaId: string,
  amountDescription: string,
  collaborationId?: string,
) {
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { userId: true, title: true, status: true },
  });
  if (!idea) throw Object.assign(new Error('Ideea nu a fost găsită.'), { status: 404 });
  if (idea.status === 'REALIZAT') {
    throw Object.assign(new Error('Ideea este deja marcată ca realizată.'), { status: 409 });
  }

  // Nu permite o a doua investiție activă/în așteptare pentru aceeași pereche
  const existing = await prisma.investmentHistory.findFirst({
    where: {
      antreprenorId,
      ideaId,
      status: { in: ['NECONFIRMAT', 'ACTIV', 'IN_NEGOCIERE'] },
    },
  });
  if (existing) {
    throw Object.assign(new Error('Există deja o investiție activă sau în așteptare pentru această idee.'), { status: 409 });
  }

  const investment = await prisma.investmentHistory.create({
    data: {
      antreprenorId,
      ideaId,
      collaborationId: collaborationId ?? null,
      investmentType: 'DIRECT',
      amountDescription,
      status: 'NECONFIRMAT',
    },
    select: {
      id: true, status: true, amountDescription: true, investmentType: true, createdAt: true,
      antreprenor: {
        select: {
          id: true,
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
    },
  });

  createNotification({
    userId: idea.userId,
    type: NotificationType.SYSTEM,
    title: 'Investiție propusă 💰',
    body: `Un antreprenor a propus o investiție pentru ideea ta „${idea.title}". Confirmă pentru a o finaliza!`,
    data: { investmentId: investment.id, ideaId },
  }).catch(() => {});

  return investment;
}

// ─────────────────────────────────────────────
// CONFIRMARE INVESTIȚIE (elev)
// ─────────────────────────────────────────────

export async function confirmDirectInvestment(investmentId: string, elevId: string) {
  const investment = await prisma.investmentHistory.findUnique({
    where: { id: investmentId },
    select: {
      id: true, antreprenorId: true, ideaId: true, status: true, amountDescription: true,
      idea: { select: { userId: true, title: true } },
    },
  });

  if (!investment) throw Object.assign(new Error('Investiția nu a fost găsită.'), { status: 404 });
  if (investment.idea.userId !== elevId) {
    throw Object.assign(new Error('Nu ești proprietarul ideii asociate acestei investiții.'), { status: 403 });
  }
  if (investment.status !== 'NECONFIRMAT') {
    throw Object.assign(new Error('Investiția nu mai este în așteptare.'), { status: 409 });
  }

  // Ambii au confirmat → ACTIV + ideea devine REALIZAT
  await prisma.$transaction([
    prisma.investmentHistory.update({
      where: { id: investmentId },
      data: { status: 'ACTIV' },
    }),
    prisma.idea.update({
      where: { id: investment.ideaId },
      data: { status: 'REALIZAT' },
    }),
  ]);

  createNotification({
    userId: investment.antreprenorId,
    type: NotificationType.SYSTEM,
    title: 'Investiție confirmată! 🏆',
    body: `Elevul a confirmat investiția pentru „${investment.idea.title}". Proiect marcat ca realizat!`,
    data: { investmentId, ideaId: investment.ideaId },
  }).catch(() => {});

  return { id: investmentId, status: 'ACTIV' };
}

// ─────────────────────────────────────────────
// LISTARE INVESTIȚII
// ─────────────────────────────────────────────

export async function getMyInvestments(userId: string) {
  return prisma.investmentHistory.findMany({
    where: { OR: [{ antreprenorId: userId }, { idea: { userId } }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, investmentType: true, amountDescription: true, status: true, createdAt: true,
      idea: {
        select: {
          id: true, title: true, categories: true, status: true,
          user: {
            select: { id: true, profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } } },
          },
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
