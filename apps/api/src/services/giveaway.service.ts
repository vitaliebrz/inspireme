import crypto from 'crypto';
import { Plan, GiveawayStatus, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  createNotification, sendGiveawayJoinEmail, sendGiveawayLeaveEmail,
  sendGiveawayWinnerEmail, sendGiveawayWinnerAntreprenorEmail,
  sendGiveawayInvestmentConfirmedEmail,
} from './notifications.service.js';
import { createConnectionRequest, openIdeaInConversation } from './chat.service.js';

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
  if (input.endDate < input.startDate) {
    throw Object.assign(new Error('Data de final nu poate fi înainte de data de start.'), { status: 400 });
  }

  const giveaway = await prisma.giveaway.create({
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

  // Confirmare lansare pentru antreprenor — non-blocking
  createNotification({
    userId: input.antreprenorId,
    type: NotificationType.GIVEAWAY_NEW,
    title: 'Giveaway lansat! 🎁',
    body: `Giveaway-ul „${input.title}" este acum activ și deschis participărilor.`,
    data: { giveawayId: giveaway.id },
  }).catch(() => {});

  return giveaway;
}

// ─────────────────────────────────────────────
// LISTARE GIVEAWAY-URI
// ─────────────────────────────────────────────

export async function getGiveaways(status?: GiveawayStatus, viewerId?: string) {
  const giveaways = await prisma.giveaway.findMany({
    where: status ? { status } : undefined,
    orderBy: { startDate: 'desc' },
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

  // Batch-fetch winner info pentru giveaway-urile finalizate
  const finishedWithWinner = giveaways.filter(
    (g) => g.status === GiveawayStatus.FINISHED && g.winnerId,
  );
  const winnerMap = new Map<string, { name: string; ideaTitle: string | null }>();

  if (finishedWithWinner.length > 0) {
    const winnerIds = finishedWithWinner.map((g) => g.winnerId as string);
    const giveawayIds = finishedWithWinner.map((g) => g.id);

    // Numele câștigătorului îl luăm DIRECT din tabelul user (robust) — nu depinde
    // de faptul că mai e participant. Un câștigător se poate retrage sau își poate
    // șterge ideea (cascade), caz în care rândul de participare dispare, dar winnerId rămâne.
    // Titlul ideii îl luăm din participare dacă mai există.
    const [winnerUsers, winnerParticipations] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: winnerIds } },
        select: { id: true, profileElev: { select: { firstName: true, lastName: true } } },
      }),
      prisma.giveawayParticipant.findMany({
        where: { giveawayId: { in: giveawayIds } },
        select: { giveawayId: true, elevId: true, idea: { select: { title: true } } },
      }),
    ]);
    const userById = new Map(winnerUsers.map((u) => [u.id, u]));

    for (const g of finishedWithWinner) {
      const u = userById.get(g.winnerId as string);
      if (!u) continue;
      const prof = u.profileElev;
      const wp = winnerParticipations.find((p) => p.giveawayId === g.id && p.elevId === g.winnerId);
      winnerMap.set(g.id, {
        name: prof ? `${prof.firstName} ${prof.lastName}` : 'Câștigător',
        ideaTitle: wp?.idea?.title ?? null,
      });
    }
  }

  const withWinner = giveaways.map((g) => ({
    ...g,
    winner: winnerMap.get(g.id) ?? null,
  }));

  if (!viewerId || withWinner.length === 0) {
    return withWinner.map((g) => ({ ...g, isParticipating: false }));
  }

  const participations = await prisma.giveawayParticipant.findMany({
    where: { elevId: viewerId, giveawayId: { in: giveaways.map((g) => g.id) } },
    select: { giveawayId: true },
  });
  const participatingIds = new Set(participations.map((p) => p.giveawayId));

  return withWinner.map((g) => ({ ...g, isParticipating: participatingIds.has(g.id) }));
}

export async function getGiveawayById(id: string, viewerId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id },
    select: {
      id: true, title: true, description: true, investmentDescription: true,
      startDate: true, endDate: true, maxParticipants: true, status: true, winnerId: true,
      investmentConfirmedByAntreprenor: true,
      investmentConfirmedByElev: true,
      investmentConfirmedAt: true,
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
  let winnerIdea: { id: string; title: string } | null = null;
  if (giveaway.winnerId) {
    winner = await prisma.user.findUnique({
      where: { id: giveaway.winnerId },
      select: { id: true, profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });
    // Ideea cu care a participat câștigătorul (dacă mai există)
    const wp = await prisma.giveawayParticipant.findFirst({
      where: { giveawayId: id, elevId: giveaway.winnerId },
      select: { idea: { select: { id: true, title: true } } },
    });
    winnerIdea = wp?.idea ?? null;
  }

  // Participarea viewerului curent
  const myParticipation = await prisma.giveawayParticipant.findFirst({
    where: { giveawayId: id, elevId: viewerId },
    select: { id: true, joinedAt: true, idea: { select: { id: true, title: true } } },
  });

  return { ...giveaway, winner, winnerIdea, myParticipation: myParticipation ?? null };
}

// ─────────────────────────────────────────────
// PARTICIPARE (elevi cu idee eligibilă)
// ─────────────────────────────────────────────

export async function joinGiveaway(giveawayId: string, elevId: string, ideaId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { status: true, startDate: true, endDate: true, maxParticipants: true, title: true },
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

  const participant = await prisma.giveawayParticipant.create({
    data: { giveawayId, elevId, ideaId },
    select: { id: true, joinedAt: true },
  });

  // Notificare + email confirmare participare — non-blocking
  createNotification({
    userId: elevId,
    type: NotificationType.GIVEAWAY_RESULT,
    title: 'Participare confirmată! 🎯',
    body: `Te-ai înscris cu succes la giveaway-ul „${giveaway.title}".`,
    data: { giveawayId },
  }).catch(() => {});

  prisma.user.findUnique({ where: { id: elevId }, select: { email: true } })
    .then((u) => {
      if (u?.email) {
        console.log(`[Giveaway] Trimit email join la ${u.email} pentru „${giveaway.title}"`);
        sendGiveawayJoinEmail(u.email, giveaway.title)
          .then(() => console.log(`[Giveaway] Email join trimis cu succes la ${u.email}`))
          .catch((err: unknown) => console.error('[Giveaway] Eroare email join:', err));
      }
    })
    .catch((err: unknown) => console.error('[Giveaway] Eroare fetch user pentru email join:', err));

  return participant;
}

export async function leaveGiveaway(giveawayId: string, elevId: string) {
  // Nu permitem retragerea după ce giveaway-ul s-a încheiat — altfel câștigătorul
  // ales s-ar putea retrage, lăsând winnerId orfan și numărul de participanți la 0.
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { status: true },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });
  if (giveaway.status !== GiveawayStatus.ACTIVE) {
    throw Object.assign(new Error('Nu te poți retrage dintr-un giveaway încheiat.'), { status: 409 });
  }

  const existing = await prisma.giveawayParticipant.findFirst({ where: { giveawayId, elevId } });
  if (!existing) throw Object.assign(new Error('Nu participi la acest giveaway.'), { status: 404 });
  await prisma.giveawayParticipant.delete({ where: { id: existing.id } });

  // Email retragere — non-blocking
  Promise.all([
    prisma.giveaway.findUnique({ where: { id: giveawayId }, select: { title: true } }),
    prisma.user.findUnique({ where: { id: elevId }, select: { email: true } }),
  ]).then(([g, u]) => {
    if (g?.title && u?.email) {
      console.log(`[Giveaway] Trimit email leave la ${u.email} pentru „${g.title}"`);
      sendGiveawayLeaveEmail(u.email, g.title)
        .then(() => console.log(`[Giveaway] Email leave trimis cu succes la ${u.email}`))
        .catch((err: unknown) => console.error('[Giveaway] Eroare email leave:', err));
    }
  }).catch((err: unknown) => console.error('[Giveaway] Eroare fetch pentru email leave:', err));

  return { success: true };
}

// ─────────────────────────────────────────────
// SELECȚIE CÂȘTIGĂTOR — exclusiv server-side cu crypto.randomInt
// ─────────────────────────────────────────────

export async function selectWinner(giveawayId: string, antreprenorId: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { title: true, antreprenorId: true, status: true, endDate: true, winnerId: true },
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
    select: { elevId: true, idea: { select: { title: true } } },
  });
  if (participants.length === 0) {
    throw Object.assign(new Error('Nu există participanți pentru acest giveaway.'), { status: 409 });
  }

  // Selecție CRIPTOGRAFIC SIGURĂ — niciodată pe client
  const winnerIndex = crypto.randomInt(0, participants.length);
  const winningParticipant = participants[winnerIndex]!;
  const winnerId = winningParticipant.elevId;
  const ideaTitle = winningParticipant.idea.title;

  await prisma.giveaway.update({
    where: { id: giveawayId },
    data: { status: GiveawayStatus.FINISHED, winnerId },
  });

  const [winner, antreprenor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: winnerId },
      select: { id: true, email: true, profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    }),
    prisma.user.findUnique({
      where: { id: antreprenorId },
      select: { email: true, profileAntreprenor: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const winnerName = winner?.profileElev ? `${winner.profileElev.firstName} ${winner.profileElev.lastName}`.trim() : 'Câștigător';
  const antreprenorName = antreprenor?.profileAntreprenor
    ? `${antreprenor.profileAntreprenor.firstName} ${antreprenor.profileAntreprenor.lastName}`.trim()
    : 'Antreprenorul';

  // Notificări in-app pentru ambele părți — non-blocking
  createNotification({
    userId: winnerId,
    type: NotificationType.GIVEAWAY_WON,
    title: '🏆 Ai câștigat un giveaway!',
    body: `Felicitări! Ai câștigat giveaway-ul „${giveaway.title}".`,
    data: { giveawayId },
  }).catch(() => {});

  createNotification({
    userId: antreprenorId,
    type: NotificationType.GIVEAWAY_RESULT,
    title: 'Câștigător ales — confirmă investiția',
    body: `${winnerName} a câștigat giveaway-ul „${giveaway.title}" cu ideea „${ideaTitle}". Contactează-l pentru a investi.`,
    data: { giveawayId },
  }).catch(() => {});

  // Email pentru câștigător — non-blocking
  if (winner?.email) {
    sendGiveawayWinnerEmail(winner.email, winnerName, giveaway.title, antreprenorName).catch(() => {});
  }

  // Email pentru antreprenor — non-blocking, cu invitație de a investi în ideea câștigătoare
  if (antreprenor?.email) {
    sendGiveawayWinnerAntreprenorEmail(antreprenor.email, antreprenorName, winnerName, giveaway.title, ideaTitle, giveawayId).catch(() => {});
  }

  return { id: giveawayId, status: GiveawayStatus.FINISHED, winnerId, winner };
}

// ─────────────────────────────────────────────
// CONFIRMARE INVESTIȚIE
// ─────────────────────────────────────────────

// Returnează statusul confirmărilor pentru un giveaway finalizat
export async function getConfirmationStatus(giveawayId: string) {
  return prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: {
      investmentConfirmedByAntreprenor: true,
      investmentConfirmedByElev: true,
      investmentConfirmedAt: true,
    },
  });
}

// Antreprenorul creator contactează câștigătorul: deschide conversația existentă
// (adăugând badge-ul EVENT cu ideea câștigătoare) sau trimite o cerere de conectare
// cu ideea câștigătoare (badge-ul apare la acceptare). Funcționează și dacă ideea
// a devenit REALIZAT.
export async function contactGiveawayWinner(giveawayId: string, userId: string, userPlan: Plan) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: { antreprenorId: true, status: true, winnerId: true },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });
  if (giveaway.antreprenorId !== userId) {
    throw Object.assign(new Error('Doar creatorul giveaway-ului poate contacta câștigătorul.'), { status: 403 });
  }
  if (giveaway.status !== GiveawayStatus.FINISHED || !giveaway.winnerId) {
    throw Object.assign(new Error('Giveaway-ul nu are câștigător ales.'), { status: 409 });
  }
  const winnerId = giveaway.winnerId;

  // Ideea câștigătoare — pentru badge-ul de context (EVENT) în chat
  const wp = await prisma.giveawayParticipant.findFirst({
    where: { giveawayId, elevId: winnerId },
    select: { ideaId: true },
  });
  const ideaId = wp?.ideaId;

  // Conversație existentă între antreprenor și câștigător?
  const conv = await prisma.conversation.findFirst({
    where: {
      OR: [
        { participantAId: userId, participantBId: winnerId },
        { participantAId: winnerId, participantBId: userId },
      ],
    },
    select: { id: true },
  });

  if (conv) {
    // Adăugăm badge-ul EVENT cu ideea câștigătoare (idempotent) și deschidem chat-ul
    if (ideaId) await openIdeaInConversation(conv.id, userId, ideaId).catch(() => {});
    return { conversationId: conv.id, requestSent: false };
  }

  // Fără conversație → cerere de conectare cu ideea câștigătoare (allowRealizat=true)
  await createConnectionRequest(userId, userPlan, winnerId, ideaId, true);
  return { conversationId: null, requestSent: true };
}

export async function confirmInvestment(giveawayId: string, userId: string, userRole: string) {
  const giveaway = await prisma.giveaway.findUnique({
    where: { id: giveawayId },
    select: {
      antreprenorId: true, status: true, winnerId: true, title: true,
      investmentConfirmedByAntreprenor: true,
      investmentConfirmedByElev: true,
    },
  });
  if (!giveaway) throw Object.assign(new Error('Giveaway-ul nu a fost găsit.'), { status: 404 });
  if (giveaway.status !== GiveawayStatus.FINISHED || !giveaway.winnerId) {
    throw Object.assign(new Error('Giveaway-ul nu are câștigător ales.'), { status: 409 });
  }

  const isAntreprenorOwner = (userRole === 'ANTREPRENOR' || userRole === 'ADMIN') && giveaway.antreprenorId === userId;
  const isWinner = userRole === 'ELEV' && giveaway.winnerId === userId;

  if (!isAntreprenorOwner && !isWinner) {
    throw Object.assign(
      new Error('Doar creatorul giveaway-ului și câștigătorul pot confirma investiția.'),
      { status: 403 },
    );
  }

  const updateData: {
    investmentConfirmedByAntreprenor?: boolean;
    investmentConfirmedByElev?: boolean;
    investmentConfirmedAt?: Date;
  } = {};

  if (isAntreprenorOwner) updateData.investmentConfirmedByAntreprenor = true;
  if (isWinner) updateData.investmentConfirmedByElev = true;

  // Ambele confirmă? → marcăm data și creăm înregistrarea de investiție
  const antreprenorConfirmed = isAntreprenorOwner ? true : giveaway.investmentConfirmedByAntreprenor;
  const elevConfirmed = isWinner ? true : giveaway.investmentConfirmedByElev;

  // Tranziția „ambele confirmate" (nu era deja complet confirmat înainte de acest apel)
  // — ca notificările/email-urile să se trimită O SINGURĂ DATĂ, nu la fiecare re-confirmare.
  const justFullyConfirmed =
    antreprenorConfirmed && elevConfirmed &&
    !(giveaway.investmentConfirmedByAntreprenor && giveaway.investmentConfirmedByElev);

  if (antreprenorConfirmed && elevConfirmed) {
    updateData.investmentConfirmedAt = new Date();
  }

  await prisma.giveaway.update({ where: { id: giveawayId }, data: updateData });

  // Înregistrare investiție + notificări — doar la PRIMA confirmare completă
  if (justFullyConfirmed) {
    const winnerParticipant = await prisma.giveawayParticipant.findFirst({
      where: { giveawayId, elevId: giveaway.winnerId },
      select: { ideaId: true },
    });
    if (winnerParticipant) {
      // Ideea câștigătoare devine REALIZAT — s-a investit în ea (badge 🏆 public)
      await prisma.idea.updateMany({
        where: { id: winnerParticipant.ideaId },
        data: { status: 'REALIZAT' },
      });

      // Creăm înregistrarea de investiție o singură dată (la confirmare completă)
      const alreadyExists = await prisma.investmentHistory.findFirst({
        where: { antreprenorId: giveaway.antreprenorId, ideaId: winnerParticipant.ideaId, investmentType: 'GIVEAWAY' },
        select: { id: true },
      });
      if (!alreadyExists) {
        await prisma.investmentHistory.create({
          data: {
            antreprenorId: giveaway.antreprenorId,
            ideaId: winnerParticipant.ideaId,
            investmentType: 'GIVEAWAY',
            amountDescription: `Giveaway ${giveawayId}`,
            status: 'ACTIV',
          },
        });
      }
    }

    // Destinatari: câștigător, antreprenor creator, admini
    const [winnerU, antreprenorU, admins] = await Promise.all([
      prisma.user.findUnique({
        where: { id: giveaway.winnerId },
        select: { email: true, profileElev: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findUnique({
        where: { id: giveaway.antreprenorId },
        select: { email: true, profileAntreprenor: { select: { firstName: true, lastName: true } } },
      }),
      prisma.user.findMany({ where: { role: 'ADMIN', isDeleted: false }, select: { id: true, email: true } }),
    ]);
    const wNm = winnerU?.profileElev ? `${winnerU.profileElev.firstName} ${winnerU.profileElev.lastName}`.trim() : 'Câștigătorul';
    const aNm = antreprenorU?.profileAntreprenor ? `${antreprenorU.profileAntreprenor.firstName} ${antreprenorU.profileAntreprenor.lastName}`.trim() : 'Antreprenorul';

    // Notificări in-app confirmare finalizată — non-blocking
    createNotification({
      userId: giveaway.antreprenorId,
      type: NotificationType.GIVEAWAY_RESULT,
      title: 'Investiție confirmată de ambele părți ✅',
      body: 'Câștigătorul a confirmat și el investiția. Colaborarea este oficializată!',
      data: { giveawayId },
    }).catch(() => {});

    createNotification({
      userId: giveaway.winnerId,
      type: NotificationType.GIVEAWAY_WON,
      title: 'Investiție confirmată de ambele părți ✅',
      body: 'Antreprenorul a confirmat și el investiția. Colaborarea este oficializată!',
      data: { giveawayId },
    }).catch(() => {});

    // Notificare pentru admini
    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        type: NotificationType.GIVEAWAY_RESULT,
        title: 'Investiție giveaway confirmată ✅',
        body: `${aNm} și ${wNm} au confirmat investiția pentru „${giveaway.title}".`,
        data: { giveawayId },
      }).catch(() => {});
    }

    // Email dublat pentru toți destinatarii (câștigător, antreprenor, admini)
    const emails = [winnerU?.email, antreprenorU?.email, ...admins.map((a) => a.email)]
      .filter((e): e is string => Boolean(e));
    for (const email of emails) {
      sendGiveawayInvestmentConfirmedEmail(email, giveaway.title, aNm, wNm, giveawayId).catch(() => {});
    }
  }

  return {
    antreprenorConfirmed,
    elevConfirmed,
    fullyConfirmed: antreprenorConfirmed && elevConfirmed,
  };
}

// ─────────────────────────────────────────────
// SELECȚIE AUTOMATĂ — rulat de scheduler la fiecare minut
// ─────────────────────────────────────────────

export async function autoSelectExpiredWinners(): Promise<void> {
  const now = new Date();

  const expiredGiveaways = await prisma.giveaway.findMany({
    where: { status: GiveawayStatus.ACTIVE, endDate: { lt: now } },
    select: { id: true, title: true, antreprenorId: true },
  });

  if (expiredGiveaways.length === 0) return;

  for (const giveaway of expiredGiveaways) {
    try {
      const participants = await prisma.giveawayParticipant.findMany({
        where: { giveawayId: giveaway.id },
        select: { elevId: true, idea: { select: { title: true } } },
      });

      if (participants.length === 0) {
        await prisma.giveaway.update({
          where: { id: giveaway.id },
          data: { status: GiveawayStatus.FINISHED },
        });
        createNotification({
          userId: giveaway.antreprenorId,
          type: NotificationType.GIVEAWAY_RESULT,
          title: 'Giveaway finalizat fără câștigător',
          body: `Giveaway-ul „${giveaway.title}" s-a încheiat fără participanți.`,
          data: { giveawayId: giveaway.id },
        }).catch(() => {});
        console.log(`[Scheduler] Giveaway ${giveaway.id}: finalizat fără participanți`);
        continue;
      }

      // Selecție CRIPTOGRAFIC SIGURĂ — niciodată pe client
      const winnerIndex = crypto.randomInt(0, participants.length);
      const winningParticipant = participants[winnerIndex]!;
      const winnerId = winningParticipant.elevId;
      const ideaTitle = winningParticipant.idea.title;

      await prisma.giveaway.update({
        where: { id: giveaway.id },
        data: { status: GiveawayStatus.FINISHED, winnerId },
      });

      createNotification({
        userId: winnerId,
        type: NotificationType.GIVEAWAY_WON,
        title: '🏆 Ai câștigat un giveaway!',
        body: `Felicitări! Ai câștigat giveaway-ul „${giveaway.title}".`,
        data: { giveawayId: giveaway.id },
      }).catch(() => {});

      createNotification({
        userId: giveaway.antreprenorId,
        type: NotificationType.GIVEAWAY_RESULT,
        title: 'Câștigător ales — confirmă investiția',
        body: `Giveaway-ul „${giveaway.title}" s-a încheiat. Câștigătorul a fost selectat automat cu ideea „${ideaTitle}". Contactează-l pentru a investi.`,
        data: { giveawayId: giveaway.id },
      }).catch(() => {});

      // Email pentru câștigător + antreprenor — non-blocking
      Promise.all([
        prisma.user.findUnique({ where: { id: winnerId }, select: { email: true, profileElev: { select: { firstName: true, lastName: true } } } }),
        prisma.user.findUnique({ where: { id: giveaway.antreprenorId }, select: { email: true, profileAntreprenor: { select: { firstName: true, lastName: true } } } }),
      ]).then(([winnerUser, antreprenorUser]) => {
        const winnerName = winnerUser?.profileElev
          ? `${winnerUser.profileElev.firstName} ${winnerUser.profileElev.lastName}`.trim()
          : 'Câștigător';
        const antreprenorName = antreprenorUser?.profileAntreprenor
          ? `${antreprenorUser.profileAntreprenor.firstName} ${antreprenorUser.profileAntreprenor.lastName}`.trim()
          : 'Antreprenorul';

        if (winnerUser?.email) {
          sendGiveawayWinnerEmail(winnerUser.email, winnerName, giveaway.title, antreprenorName).catch(() => {});
        }
        if (antreprenorUser?.email) {
          sendGiveawayWinnerAntreprenorEmail(antreprenorUser.email, antreprenorName, winnerName, giveaway.title, ideaTitle, giveaway.id).catch(() => {});
        }
      }).catch(() => {});

      console.log(`[Scheduler] Giveaway ${giveaway.id}: câștigător ales din ${participants.length} participanți`);
    } catch (err) {
      console.error(`[Scheduler] Eroare la giveaway ${giveaway.id}:`, err);
    }
  }
}

// ─────────────────────────────────────────────
// JOB ZILNIC — deadline-uri confirmare investiție (spec: 30 zile reminder, 37 zile badge)
// Ancoră: endDate (finalul giveaway-ului). Rulează zilnic.
// ─────────────────────────────────────────────

export async function processGiveawayInvestmentDeadlines(): Promise<void> {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const d30 = new Date(now - 30 * DAY);
  const d37 = new Date(now - 37 * DAY);

  // 30 zile după finalizare — reminder de confirmare (dacă nu e complet confirmat)
  const toRemind = await prisma.giveaway.findMany({
    where: {
      status: GiveawayStatus.FINISHED,
      winnerId: { not: null },
      investmentConfirmedAt: null,
      badgeUnfulfilled: false,
      endDate: { lt: d30, gte: d37 },
    },
    select: { id: true, title: true, antreprenorId: true, winnerId: true },
  });

  for (const g of toRemind) {
    // Dedup — o singură dată în ultimele 7 zile (fereastra reminder-ului e 30–37 zile)
    const recent = await prisma.notification.findFirst({
      where: {
        userId: g.antreprenorId,
        type: NotificationType.GIVEAWAY_RESULT,
        data: { path: ['giveawayId'], equals: g.id },
        title: { startsWith: 'Confirmă investiția' },
        createdAt: { gte: new Date(now - 7 * DAY) },
      },
      select: { id: true },
    });
    if (recent) continue;

    createNotification({
      userId: g.antreprenorId,
      type: NotificationType.GIVEAWAY_RESULT,
      title: 'Confirmă investiția giveaway',
      body: `Au trecut 30 de zile de la „${g.title}". Confirmă investiția pentru a o oficializa.`,
      data: { giveawayId: g.id },
    }).catch(() => {});
    createNotification({
      userId: g.winnerId!,
      type: NotificationType.GIVEAWAY_WON,
      title: 'Confirmă investiția giveaway',
      body: `Au trecut 30 de zile de la „${g.title}". Confirmă investiția pentru a o oficializa.`,
      data: { giveawayId: g.id },
    }).catch(() => {});
  }

  // 37 zile după finalizare — badge „neîndeplinit" dacă tot nu s-a confirmat
  const unfulfilled = await prisma.giveaway.findMany({
    where: {
      status: GiveawayStatus.FINISHED,
      winnerId: { not: null },
      investmentConfirmedAt: null,
      badgeUnfulfilled: false,
      endDate: { lt: d37 },
    },
    select: { id: true, title: true, antreprenorId: true },
  });

  for (const g of unfulfilled) {
    await prisma.giveaway.update({ where: { id: g.id }, data: { badgeUnfulfilled: true } });
    createNotification({
      userId: g.antreprenorId,
      type: NotificationType.GIVEAWAY_RESULT,
      title: 'Badge „Giveaway neîndeplinit"',
      body: `Investiția pentru „${g.title}" nu a fost confirmată în 37 de zile. Giveaway-ul a fost marcat ca neîndeplinit.`,
      data: { giveawayId: g.id },
    }).catch(() => {});
  }
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
