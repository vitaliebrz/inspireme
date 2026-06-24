import { Plan, ConnectionRequestStatus, MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';

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
  ideaId: string,
) {
  // Verificăm că toUserId nu a blocat pe fromUser
  const blocked = await prisma.blockedUser.findFirst({
    where: { blockerId: toUserId, blockedId: fromUserId },
  });
  if (blocked) throw Object.assign(new Error('Nu poți contacta acest utilizator.'), { status: 403 });

  // Verificăm că ideaId există și aparține toUserId
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { userId: true },
  });
  if (!idea || idea.userId !== toUserId) {
    throw Object.assign(new Error('Ideea nu există sau nu aparține acestui utilizator.'), { status: 404 });
  }

  // Verificăm că nu există deja o cerere pending/acceptată
  const existing = await prisma.connectionRequest.findFirst({
    where: {
      fromUserId,
      toUserId,
      ideaId,
      status: { in: [ConnectionRequestStatus.PENDING, ConnectionRequestStatus.ACCEPTED] },
    },
  });
  if (existing) throw Object.assign(new Error('Ai trimis deja o cerere pentru această idee.'), { status: 409 });

  // Limite plan antreprenor
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
    data: { fromUserId, toUserId, ideaId, status: ConnectionRequestStatus.PENDING, expiresAt },
    select: { id: true, status: true, createdAt: true },
  });

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

  // Dacă acceptată, creăm conversația
  if (action === 'ACCEPTED') {
    const existing = await prisma.conversation.findFirst({
      where: { elevId: request.toUserId, antreprenorId: request.fromUserId },
    });

    if (!existing) {
      await prisma.conversation.create({
        data: {
          elevId: request.toUserId,
          antreprenorId: request.fromUserId,
          connectionRequestId: requestId,
        },
      });
    }

    // Actualizăm statusul ideii la CONTACTAT (prima cerere acceptată)
    if (request.ideaId) {
      await prisma.idea.updateMany({
        where: { id: request.ideaId, status: 'PUBLICAT' },
        data: { status: 'CONTACTAT' },
      });
    }
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
          profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
        },
      },
    },
  });
}

// ─────────────────────────────────────────────
// CONVERSAȚII
// ─────────────────────────────────────────────

export async function getConversations(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      OR: [{ elevId: userId }, { antreprenorId: userId }],
    },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true, lastMessageAt: true, createdAt: true,
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
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, type: true, createdAt: true, senderId: true },
      },
    },
  });

  return conversations;
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
    select: { elevId: true, antreprenorId: true },
  });
  if (!conv) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (conv.elevId !== userId && conv.antreprenorId !== userId) {
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
      createdAt: true, senderId: true,
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
) {
  // Verificăm apartenența la conversație
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { elevId: true, antreprenorId: true },
  });
  if (!conv) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (conv.elevId !== senderId && conv.antreprenorId !== senderId) {
    throw Object.assign(new Error('Nu faci parte din această conversație.'), { status: 403 });
  }

  // Limită mesaje zilnice pentru elevii Gratuit
  const isElev = conv.elevId === senderId;
  if (isElev && senderPlan === Plan.GRATUIT) {
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
    },
    select: { id: true, content: true, type: true, fileUrl: true, createdAt: true, senderId: true },
  });

  // Actualizăm lastMessageAt pe conversație
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  return message;
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
) {
  const report = await prisma.report.create({
    data: {
      reporterId,
      contentType,
      contentId,
      reason,
      status: 'PENDING',
    },
    select: { id: true },
  });

  // Auto-blocare conținut la 3 rapoarte de utilizatori diferiți
  const reportCount = await prisma.report.count({
    where: { contentType, contentId, status: 'PENDING' },
  });

  if (reportCount >= 3 && contentType === 'IDEA') {
    await prisma.blockedContent.upsert({
      where: { ideaId: contentId },
      create: { ideaId: contentId, reason: 'Auto-blocat: 3+ rapoarte' },
      update: {},
    });
  }

  return report;
}
