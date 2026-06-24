import crypto from 'crypto';
import { Plan, GiveawayStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// ─────────────────────────────────────────────
// CREARE GIVEAWAY (doar antreprenori Pro)
// ─────────────────────────────────────────────

export interface CreateGiveawayInput {
  antreprenorId: string;
  antreprenorPlan: Plan;
  title: string;
  description: string;
  investmentDescription: string;
  startDate: Date;
  endDate: Date;
  maxParticipants?: number;
}

export async function createGiveaway(input: CreateGiveawayInput) {
  if (input.antreprenorPlan !== Plan.PRO) {
    throw Object.assign(new Error('Doar antreprenorii Pro pot lansa giveaway-uri.'), { status: 403 });
  }
  if (input.endDate <= input.startDate) {
    throw Object.assign(new Error('Data de final trebuie să fie după data de start.'), { status: 400 });
  }

  return prisma.giveaway.create({
    data: {
      antreprenorId: input.antreprenorId,
      title: input.title,
      description: input.description,
      investmentDescription: input.investmentDescription,
      startDate: input.startDate,
      endDate: input.endDate,
      maxParticipants: input.maxParticipants ?? null,
      status: GiveawayStatus.ACTIVE,
    },
    select: { id: true, title: true, status: true, startDate: true, endDate: true, maxParticipants: true },
  });
}

// ─────────────────────────────────────────────
// LISTARE GIVEAWAY-URI
// ─────────────────────────────────────────────

export async function getGiveaways(status?: GiveawayStatus) {
  return prisma.giveaway.findMany({
    where: status ? { status } : undefined,
    orderBy: { startDate: 'desc' },
    select: {
      id: true, title: true, description: true, investmentDescription: true,
      startDate: true, endDate: true, maxParticipants: true, status: true,
      antreprenor: {
        select: {
          id: true,
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
      _count: { select: { participants: true } },
    },
  });
}

export async function getGiveawayById(id: string, viewerId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, investmentDescription: true,
      startDate: true, endDate: true, maxParticipants: true, status: true, winnerId: true,
      antreprenor: {
        select: {
          id: true,
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
      _count: { select: { participants: true } },
    },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });

  // Câștigător — query separat (winner nu e relație în schemă)
  let winner: { id: string; profileElev: { firstName: string; lastName: string; avatarUrl: string | null } | null } | null = null;
  if (giveaway.winnerId) {
    winner = await prisma.user.findUnique({
      where: { id: giveaway.winnerId },
      select: { id: true, profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
  }

  // Participarea viewerului curent
  const myParticipation = await prisma.giveawayParticipant.findFirst({
    where: { giveawayId: id, elevId: viewerId },
    select: { id: true, joinedAt: true, idea: { select: { id: true, title: true } } },
  });

  return { ...giveaway, winner, myParticipation: myParticipation ?? null };
}

// ─────────────────────────────────────────────
// PARTICIPARE (elevi cu idee eligibilă)
// ─────────────────────────────────────────────

export async function joinGiveaway(giveawayId: string, elevId: string, ideaId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { status: true, startDate: true, endDate: true, maxParticipants: true },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });
  if (giveaway.status !== GiveawayStatus.ACTIVE) {
    throw Object.assign(new Error('Giveaway-ul nu mai este activ.'), { status: 409 });
  }

  const now = new Date();
  if (now < giveaway.startDate) throw Object.assign(new Error('Giveaway-ul nu a început încă.'), { status: 409 });
  if (now > giveaway.endDate) throw Object.assign(new Error('Giveaway-ul s-a încheiat.'), { status: 409 });

  // Idee eligibilă: aparține elevului, min 100 cuvinte, min o imagine sau PDF
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { userId: true, wordCount: true, images: { select: { id: true }, take: 1 }, pdfs: { select: { id: true }, take: 1 } },
  });
  if (!idea || idea.userId !== elevId) {
    throw Object.assign(new Error('Ideea nu există sau nu îți aparține.'), { status: 403 });
  }
  if (idea.wordCount < 100) {
    throw Object.assign(new Error('Ideea trebuie să aibă cel puțin 100 de cuvinte.'), { status: 400 });
  }
  if (idea.images.length === 0 && idea.pdfs.length === 0) {
    throw Object.assign(new Error('Ideea trebuie să aibă cel puțin o imagine sau un PDF.'), { status: 400 });
  }

  const existing = await prisma.giveawayParticipant.findFirst({ where: { giveawayId, elevId } });
  if (existing) throw Object.assign(new Error('Participi deja la acest giveaway.'), { status: 409 });

  if (giveaway.maxParticipants !== null) {
    const count = await prisma.giveawayParticipant.count({ where: { giveawayId } });
    if (count >= giveaway.maxParticipants) {
      throw Object.assign(new Error('Numărul maxim de participanți a fost atins.'), { status: 409 });
    }
  }

  return prisma.giveawayParticipant.create({
    data: { giveawayId, elevId, ideaId },
    select: { id: true, joinedAt: true },
  });
}

export async function leaveGiveaway(giveawayId: string, elevId: string) {
  const existing = await prisma.giveawayParticipant.findFirst({ where: { giveawayId, elevId } });
  if (!existing) throw Object.assign(new Error('Nu participi la acest giveaway.'), { status: 404 });
  await prisma.giveawayParticipant.delete({ where: { id: existing.id } });
  return { success: true };
}

// ─────────────────────────────────────────────
// SELECȚIE CÂȘTIGĂTOR — exclusiv server-side cu crypto.randomInt
// ─────────────────────────────────────────────

export async function selectWinner(giveawayId: string, antreprenorId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { antreprenorId: true, status: true, endDate: true, winnerId: true },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });
  if (giveaway.antreprenorId !== antreprenorId) {
    throw Object.assign(new Error('Nu ai drept să alegi câștigătorul acestui giveaway.'), { status: 403 });
  }
  if (giveaway.status === GiveawayStatus.FINISHED) {
    throw Object.assign(new Error('Câștigătorul a fost deja ales.'), { status: 409 });
  }
  if (new Date() < giveaway.endDate) {
    throw Object.assign(new Error('Giveaway-ul nu s-a încheiat încă.'), { status: 409 });
  }

  const participants = await prisma.giveawayParticipant.findMany({
    where: { giveawayId },
    select: { elevId: true },
  });
  if (participants.length === 0) {
    throw Object.assign(new Error('Nu există participanți pentru acest giveaway.'), { status: 409 });
  }

  // Selecție CRIPTOGRAFIC SIGURĂ — niciodată pe client
  const winnerIndex = crypto.randomInt(0, participants.length);
  const winnerId = participants[winnerIndex]!.elevId;

  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { status: GiveawayStatus.FINISHED, winnerId },
  });

  const winner = await prisma.user.findUnique({
    where: { id: winnerId },
    select: { id: true, profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } } },
  });

  return { id: giveawayId, status: GiveawayStatus.FINISHED, winnerId, winner };
}

// ─────────────────────────────────────────────
// CONFIRMARE INVESTIȚIE
// ─────────────────────────────────────────────

export async function confirmInvestment(giveawayId: string, antreprenorId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { antreprenorId: true, status: true, winnerId: true },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });
  if (giveaway.antreprenorId !== antreprenorId) {
    throw Object.assign(new Error('Nu ai drept să confirmi această investiție.'), { status: 403 });
  }
  if (giveaway.status !== GiveawayStatus.FINISHED || !giveaway.winnerId) {
    throw Object.assign(new Error('Giveaway-ul nu are câștigător ales.'), { status: 409 });
  }

  // Găsim ideea câștigătorului din giveaway
  const winnerParticipant = await prisma.giveawayParticipant.findFirst({
    where: { giveawayId, elevId: giveaway.winnerId },
    select: { ideaId: true },
  });
  if (!winnerParticipant) {
    throw Object.assign(new Error('Participarea câștigătorului nu a fost găsită.'), { status: 500 });
  }

  const investment = await prisma.investmentHistory.create({
    data: {
      antreprenorId,
      ideaId: winnerParticipant.ideaId,
      investmentType: 'GIVEAWAY',
      amountDescription: `Giveaway ${giveawayId}`,
      status: 'ACTIV',
    },
    select: { id: true, status: true, createdAt: true },
  });

  // Marcăm investiția confirmată pe giveaway
  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { investmentConfirmedAt: new Date() },
  });

  return investment;
}

// ─────────────────────────────────────────────
// GIVEAWAY-URI PROPRII (antreprenor)
// ─────────────────────────────────────────────

export async function getMyGiveaways(antreprenorId: string) {
  return prisma.giveaway.findMany({
    where: { antreprenorId },
    orderBy: { startDate: 'desc' },
    select: {
      id: true, title: true, status: true, startDate: true, endDate: true,
      winnerId: true, maxParticipants: true,
      _count: { select: { participants: true } },
    },
  });
}
