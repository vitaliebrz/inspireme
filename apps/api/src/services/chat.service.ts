import { Plan, ConnectionRequestStatus, MessageType, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { createNotification, sendConnectionRequestEmail } from './notifications.service.js';
import { emitToUser, emitToConversation, isUserInRoom } from '../lib/socket.js';

const MAX_MSG_GRATUIT_PER_DAY = 5;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ─────────────────────────────────────────────
// CERERI CONECTARE
// ─────────────────────────────────────────────

export async function createConnectionRequest(
  fromUserId: string,
  fromUserPlan: Plan,
  toUserId: string,
  ideaId?: string,
  // Pentru contexte legitime (ex. antreprenorul contactează câștigătorul unui
  // giveaway) permitem cererea chiar dacă ideea a devenit REALIZAT.
  allowRealizat = false,
) {
  // Verificăm că toUserId nu a blocat pe fromUser
  const blocked = await prisma.blockedUser.findFirst({
    where: { blockerId: toUserId, blockedId: fromUserId },
  });
  if (blocked) throw Object.assign(new Error('Nu poți contacta acest utilizator.'), { status: 403 });

  // Dacă ideaId e furnizat, verificăm că aparține toUserId și nu e realizată
  let ideaTitle: string | null = null;
  if (ideaId) {
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
      select: { userId: true, status: true, title: true },
    });
    if (!idea || idea.userId !== toUserId) {
      throw Object.assign(new Error('Ideea nu există sau nu aparține acestui utilizator.'), { status: 404 });
    }
    if (idea.status === 'REALIZAT' && !allowRealizat) {
      throw Object.assign(new Error('Această idee este marcată ca realizată și nu mai acceptă cereri de conectare.'), { status: 409 });
    }
    ideaTitle = idea.title;
  }

  // Verificăm că nu există deja o cerere pending/acceptată (cu sau fără ideaId)
  const existing = await prisma.connectionRequest.findFirst({
    where: {
      fromUserId,
      toUserId,
      ideaId: ideaId ?? null,
      status: { in: [ConnectionRequestStatus.PENDING, ConnectionRequestStatus.ACCEPTED] },
    },
  });
  if (existing) {
    const msg = ideaId
      ? 'Ai trimis deja o cerere pentru această idee.'
      : 'Ai trimis deja o cerere de conectare acestui utilizator.';
    throw Object.assign(new Error(msg), { status: 409 });
  }

  // Limite plan (valabil pentru orice tip de cerere)
  if (fromUserPlan === Plan.GRATUIT) {
    const totalSent = await prisma.connectionRequest.count({ where: { fromUserId } });
    if (totalSent >= 5) {
      throw Object.assign(new Error('Ai atins limita de 5 cereri (Plan Gratuit). Upgradează la Pro.'), { status: 403 });
    }
  } else {
    // Pro: max 30/zi Redis counter
    const counterKey = `cr:${fromUserId}:${todayKey()}`;
    const todayCount = Number(await redis.get<number>(counterKey) ?? 0);
    if (todayCount >= 30) {
      throw Object.assign(new Error('Ai atins limita zilnică de 30 cereri (Plan Pro).'), { status: 429 });
    }
    const ttl = 86400 - (Date.now() / 1000 - new Date().setHours(0, 0, 0, 0) / 1000);
    await redis.set(counterKey, todayCount + 1, { ex: Math.ceil(ttl) });
  }

  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 an

  const request = await prisma.connectionRequest.create({
    data: { fromUserId, toUserId, ideaId: ideaId ?? null, status: ConnectionRequestStatus.PENDING, expiresAt },
    select: { id: true, status: true, createdAt: true },
  });

  // Fetch profil expeditor pentru notificare cu context (nume + avatar)
  const senderUser = await prisma.user.findUnique({
    where: { id: fromUserId },
    select: {
      profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
      profileAntreprenor: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  });
  const sp = senderUser?.profileElev ?? senderUser?.profileAntreprenor;
  const fromName = sp ? `${sp.firstName} ${sp.lastName}`.trim() : 'Utilizator';
  const fromAvatarUrl = sp?.avatarUrl ?? '';

  // Notificare pentru destinatar — non-blocking
  createNotification({
    userId: toUserId,
    type: NotificationType.CONNECTION_REQUEST,
    title: `${fromName} vrea să se conecteze cu tine`,
    body: ideaId ? 'A trimis o cerere pentru ideea ta.' : 'Vrea să intre în contact cu tine.',
    data: { requestId: request.id, fromUserId, fromName, fromAvatarUrl, ...(ideaId ? { ideaId } : {}) },
  }).catch(() => {});

  // Email pentru destinatar — non-blocking
  prisma.user.findUnique({ where: { id: toUserId }, select: { email: true } })
    .then((toUser) => toUser && sendConnectionRequestEmail(toUser.email, fromName, ideaTitle))
    .catch(() => {});

  return request;
}

export async function respondToConnectionRequest(
  requestId: string,
  userId: string,
  action: 'ACCEPTED' | 'REFUSED',
) {
  const request = await prisma.connectionRequest.findUnique({
    where: { id: requestId },
    select: { id: true, fromUserId: true, toUserId: true, ideaId: true, status: true },
  });

  if (!request) throw Object.assign(new Error('Cerere negăsită.'), { status: 404 });
  if (request.toUserId !== userId) throw Object.assign(new Error('Nu ai drept să răspunzi la această cerere.'), { status: 403 });
  if (request.status !== ConnectionRequestStatus.PENDING) {
    throw Object.assign(new Error('Cererea a fost deja procesată.'), { status: 409 });
  }

  await prisma.connectionRequest.update({
    where: { id: requestId },
    data: { status: action === 'ACCEPTED' ? ConnectionRequestStatus.ACCEPTED : ConnectionRequestStatus.REFUSED },
  });

  // Dacă acceptată, creăm conversația și înregistrarea de colaborare
  if (action === 'ACCEPTED') {
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { participantAId: request.toUserId, participantBId: request.fromUserId },
          { participantAId: request.fromUserId, participantBId: request.toUserId },
        ],
      },
      select: { id: true },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          participantAId: request.toUserId,
          participantBId: request.fromUserId,
          connectionRequestId: requestId,
          originIdeaId: request.ideaId ?? null,
        },
        select: { id: true },
      });
    }

    // Creăm colaborarea INDIFERENT dacă conversația exista — fiecare cerere acceptată = idee nouă potențial
    if (request.ideaId) {
      const existingCollab = await prisma.collaboration.findFirst({
        where: { elevId: request.toUserId, antreprenorId: request.fromUserId, ideaId: request.ideaId },
      });
      if (!existingCollab) {
        await prisma.collaboration.create({
          data: { elevId: request.toUserId, antreprenorId: request.fromUserId, ideaId: request.ideaId },
        });
      }
    }

    // Actualizăm statusul ideii la CONTACTAT (prima cerere acceptată)
    if (request.ideaId) {
      await prisma.idea.updateMany({
        where: { id: request.ideaId, status: 'PUBLICAT' },
        data: { status: 'CONTACTAT' },
      });
    }

    // Creăm mesaj EVENT cu titlul ideii — marchează schimbarea de idee în conversație
    if (request.ideaId) {
      const idea = await prisma.idea.findUnique({
        where: { id: request.ideaId },
        select: { title: true },
      });
      if (idea) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            senderId: request.fromUserId,
            content: idea.title,
            type: MessageType.EVENT,
            ideaId: request.ideaId,
          },
        });
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        });
      }
    }

    // Notificare pentru antreprenor — include conversationId pentru link direct la chat
    createNotification({
      userId: request.fromUserId,
      type: NotificationType.CONNECTION_ACCEPTED,
      title: 'Cerere acceptată ✅',
      body: 'Elevul ți-a acceptat cererea de conectare. Poți trimite acum mesaje.',
      data: {
        requestId,
        ideaId: request.ideaId ?? '',
        conversationId: conversation.id,
      },
    }).catch(() => {});
  }

  return { success: true, action };
}

export async function getPendingRequests(userId: string) {
  return prisma.connectionRequest.findMany({
    where: { toUserId: userId, status: ConnectionRequestStatus.PENDING },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, status: true, createdAt: true, expiresAt: true,
      idea: { select: { id: true, title: true } },
      fromUser: {
        select: {
          id: true,
          role: true,
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// CONVERSAȚII
// ─────────────────────────────────────────────

export async function getConversationWith(userId: string, targetId: string) {
  const conv = await prisma.conversation.findFirst({
    where: {
      OR: [
        { participantAId: userId, participantBId: targetId },
        { participantAId: targetId, participantBId: userId },
      ],
    },
    select: { id: true },
  });
  return conv ? { conversationId: conv.id } : null;
}

export async function getConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ participantAId: userId }, { participantBId: userId }],
    },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true, lastMessageAt: true, createdAt: true,
      originIdeaId: true,
      originIdea: { select: { id: true, title: true } },
      // Fallback pentru conversații create înainte de adăugarea originIdeaId
      connectionRequest: { select: { idea: { select: { id: true, title: true } } } },
      participantA: {
        select: {
          id: true,
          role: true,
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
      participantB: {
        select: {
          id: true,
          role: true,
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, type: true, createdAt: true, senderId: true },
      },
    },
  });

  // Normalizăm originIdea: folosim câmpul direct sau fallback la ideea din cererea de conectare
  return conversations.map((conv) => ({
    ...conv,
    originIdea: conv.originIdea ?? conv.connectionRequest?.idea ?? null,
  }));
}

// ─────────────────────────────────────────────
// MESAJE
// ─────────────────────────────────────────────

export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
) {
  // Verificăm că userul face parte din conversație
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conv) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (conv.participantAId !== userId && conv.participantBId !== userId) {
    throw Object.assign(new Error('Nu faci parte din această conversație.'), { status: 403 });
  }

  const PAGE = 30;
  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: PAGE + 1,
    select: {
      id: true, content: true, type: true, fileUrl: true,
      createdAt: true, senderId: true, readAt: true,
      ideaId: true,
      idea: { select: { id: true, title: true } },
      replyTo: {
        select: {
          id: true, content: true, type: true,
          sender: {
            select: {
              profileElev: { select: { firstName: true, lastName: true } },
              profileAntreprenor: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  const hasNextPage = messages.length > PAGE;
  const items = messages.slice(0, PAGE).reverse();
  const nextCursor = hasNextPage ? items[0]?.id : null;

  return { items, nextCursor, hasNextPage };
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  senderPlan: Plan,
  content: string,
  type: MessageType = MessageType.TEXT,
  fileUrl?: string,
  replyToId?: string,
  ideaId?: string,
) {
  // Verificăm apartenența la conversație
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conv) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (conv.participantAId !== senderId && conv.participantBId !== senderId) {
    throw Object.assign(new Error('Nu faci parte din această conversație.'), { status: 403 });
  }

  // Limită mesaje zilnice pentru utilizatorii Gratuit
  const isParticipant = conv.participantAId === senderId || conv.participantBId === senderId;
  if (isParticipant && senderPlan === Plan.GRATUIT) {
    const msgKey = `msg:${senderId}:${todayKey()}`;
    const todayCount = Number(await redis.get<number>(msgKey) ?? 0);
    if (todayCount >= MAX_MSG_GRATUIT_PER_DAY) {
      throw Object.assign(
        new Error(`Limita zilnică de ${MAX_MSG_GRATUIT_PER_DAY} mesaje atinsă (Plan Gratuit).`),
        { status: 429 },
      );
    }
    const ttl = 86400 - (Date.now() / 1000 - new Date().setHours(0, 0, 0, 0) / 1000);
    await redis.set(msgKey, todayCount + 1, { ex: Math.ceil(ttl) });
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      content,
      type,
      fileUrl: fileUrl ?? null,
      replyToId: replyToId ?? null,
      ideaId: ideaId ?? null,
    },
    select: {
      id: true, content: true, type: true, fileUrl: true, createdAt: true, senderId: true, readAt: true,
      ideaId: true,
      idea: { select: { id: true, title: true } },
      replyTo: {
        select: {
          id: true, content: true, type: true,
          sender: {
            select: {
              profileElev: { select: { firstName: true, lastName: true } },
              profileAntreprenor: { select: { firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });

  // Actualizăm lastMessageAt pe conversație
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  // Emitem mesajul complet în camera conversației (server-authoritative).
  // Doar participanții pot fi în această cameră (vezi join:conversation), deci
  // livrarea în timp real nu depinde de retransmiterea payload-ului de la client.
  emitToConversation(conversationId, 'message:new', { conversationId, message });

  const receiverId = conv.participantAId === senderId ? conv.participantBId : conv.participantAId;

  // Emitem message:new pe camera personală a receiverului — pentru sunet, badge și preview sidebar
  // Include suficiente date pentru a actualiza preview-ul conversației fără re-fetch
  emitToUser(receiverId, 'message:new', {
    conversationId,
    message: {
      senderId,
      content: message.content,
      type: message.type as string,
      createdAt: message.createdAt.toISOString(),
    },
  });

  // Dacă destinatarul e deja în conversație, vede mesajul direct → nu creăm
  // notificare persistentă (primește doar sunetul, prin message:new de mai sus).
  const receiverInChat = await isUserInRoom(`conversation:${conversationId}`, receiverId);
  if (!receiverInChat) {
    // O notificare SEPARATĂ pentru fiecare mesaj (nu upsert) — ca să se vadă toate
    // mesajele venite, fiecare cu textul lui: „Ion: salut", apoi „Ion: ce faci".
    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: {
        profileElev: { select: { firstName: true, lastName: true } },
        profileAntreprenor: { select: { firstName: true, lastName: true } },
      },
    });
    const sp = sender?.profileElev ?? sender?.profileAntreprenor;
    const senderName = sp ? `${sp.firstName} ${sp.lastName}`.trim() : 'Cineva';
    const preview = type === MessageType.IMAGE ? `${senderName} a trimis o poză`
      : type === MessageType.VIDEO ? `${senderName} a trimis un videoclip`
      : type === MessageType.PDF ? `${senderName} a trimis un fișier`
      : `${senderName}: ${content.length > 80 ? content.slice(0, 77) + '...' : content}`;

    createNotification({
      userId: receiverId,
      type: NotificationType.MESSAGE_NEW,
      title: senderName,
      body: preview,
      data: { conversationId, senderId },
    }).catch(() => {});
  }

  return message;
}

// ─────────────────────────────────────────────
// READ RECEIPTS
// ─────────────────────────────────────────────

export async function markMessagesAsRead(conversationId: string, userId: string): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conv) return null;
  if (conv.participantAId !== userId && conv.participantBId !== userId) return null;

  const readAt = new Date();
  const { count } = await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, readAt: null },
    data: { readAt },
  });

  // Emitem doar dacă au existat mesaje necitite — nu spamăm
  if (count > 0) {
    const readAtStr = readAt.toISOString();
    emitToConversation(conversationId, 'messages:read', { conversationId, readAt: readAtStr });
    return readAtStr;
  }
  return null;
}

// ─────────────────────────────────────────────
// DESCHIDE CONVERSAȚIE PENTRU O IDEE NOUĂ
// ─────────────────────────────────────────────

export async function openIdeaInConversation(
  conversationId: string,
  userId: string,
  ideaId: string,
) {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { participantAId: true, participantBId: true },
  });
  if (!conv) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (conv.participantAId !== userId && conv.participantBId !== userId) {
    throw Object.assign(new Error('Nu faci parte din această conversație.'), { status: 403 });
  }

  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { title: true } });
  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });

  // Idempotent — nu creăm duplicate
  const existing = await prisma.message.findFirst({
    where: { conversationId, type: MessageType.EVENT, ideaId },
  });
  if (existing) return { created: false };

  await prisma.message.create({
    data: { conversationId, senderId: userId, content: idea.title, type: MessageType.EVENT, ideaId },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  return { created: true };
}

// ─────────────────────────────────────────────
// BLOCARE
// ─────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string) {
  const existing = await prisma.blockedUser.findFirst({
    where: { blockerId, blockedId },
  });
  if (existing) return { already: true };

  await prisma.blockedUser.create({ data: { blockerId, blockedId } });
  return { success: true };
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await prisma.blockedUser.deleteMany({ where: { blockerId, blockedId } });
  return { success: true };
}

// ─────────────────────────────────────────────
// RAPORTARE
// ─────────────────────────────────────────────

export async function reportContent(
  reporterId: string,
  contentType: 'IDEA' | 'MESSAGE' | 'USER',
  contentId: string,
  reason: string,
  relatedIdeaId?: string,
) {
  // relatedIdeaId = ideea originală indicată de reporter, la un raport de duplicat.
  // Valid doar pentru IDEA și doar dacă ideea originală chiar există.
  if (relatedIdeaId) {
    if (contentType !== 'IDEA') {
      throw Object.assign(new Error('relatedIdeaId este valid doar pentru rapoarte de tip IDEA.'), { status: 400 });
    }
    if (relatedIdeaId === contentId) {
      throw Object.assign(new Error('O idee nu poate fi raportată ca duplicat al ei înseși.'), { status: 400 });
    }
    const original = await prisma.idea.findUnique({ where: { id: relatedIdeaId }, select: { id: true } });
    if (!original) throw Object.assign(new Error('Ideea originală indicată nu a fost găsită.'), { status: 404 });
  }

  // Evită rapoarte duplicate DESCHISE: un utilizator nu poate avea două rapoarte
  // PENDING pe același conținut. După ce adminul rezolvă, poate raporta din nou
  // (comportamentul s-a repetat).
  const existing = await prisma.report.findFirst({
    where: { reporterId, contentType, contentId, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) return existing;

  const report = await prisma.report.create({
    data: {
      reporterId,
      contentType,
      contentId,
      reason,
      relatedIdeaId: relatedIdeaId ?? null,
      status: 'PENDING',
    },
    select: { id: true },
  });

  // Notificăm toți adminii că a apărut un raport nou de moderat
  const adminsToNotify = await prisma.user.findMany({
    where: { role: 'ADMIN', isDeleted: false },
    select: { id: true },
  });
  for (const admin of adminsToNotify) {
    createNotification({
      userId: admin.id,
      type: NotificationType.SYSTEM,
      title: relatedIdeaId ? 'Raport nou de idee duplicată' : 'Raport nou de moderat',
      body: `A fost trimis un raport nou (${contentType}). Verifică în panoul de moderare.`,
      data: { reportId: report.id, contentType, contentId },
    }).catch(() => {});
  }

  // Numărăm reporteri DISTINCȚI (nu total rapoarte — altfel o persoană ar putea abuza).
  // Rapoartele de duplicat (relatedIdeaId setat) NU intră la acest calcul — similaritatea
  // e subiectivă, deci auto-blocarea la 3 rapoarte rămâne rezervată motivelor obișnuite
  // (conținut inadecvat etc.); duplicatul se rezolvă mereu manual de admin.
  const distinctReporters = await prisma.report.findMany({
    where: { contentType, contentId, status: 'PENDING', relatedIdeaId: null },
    distinct: ['reporterId'],
    select: { reporterId: true },
  });
  const distinctCount = distinctReporters.length;

  // Idee publică → auto-blocare la 3 utilizatori diferiți
  if (contentType === 'IDEA' && distinctCount >= 3) {
    await prisma.blockedContent.upsert({
      where: { ideaId: contentId },
      create: { ideaId: contentId, reason: 'Auto-blocat: 3+ rapoarte de la utilizatori diferiți' },
      update: {},
    });
  }

  // Utilizator (raportat din chat) → auto-suspendare la 3 utilizatori diferiți,
  // în așteptarea deciziei finale a adminului. Protejează comunitatea de recidiviști.
  if (contentType === 'USER' && distinctCount >= 3) {
    const target = await prisma.user.findUnique({
      where: { id: contentId },
      select: { isSuspended: true, isDeleted: true },
    });
    if (target && !target.isSuspended && !target.isDeleted) {
      await prisma.user.update({
        where: { id: contentId },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendReason: 'Auto-suspendat: 3+ rapoarte de la utilizatori diferiți (în așteptarea deciziei adminului)',
        },
      });
      // Notificăm adminii pentru revizuire
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isDeleted: false }, select: { id: true } });
      for (const admin of admins) {
        createNotification({
          userId: admin.id,
          type: NotificationType.SYSTEM,
          title: 'Utilizator auto-suspendat (rapoarte)',
          body: 'Un utilizator a fost suspendat automat după 3 rapoarte de la utilizatori diferiți. Verifică în moderare.',
          data: { userId: contentId },
        }).catch(() => {});
      }
    }
  }

  return report;
}
