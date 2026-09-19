import { MessageType, NotificationType, Plan } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { redis } from '../lib/redis.js';
import { emitToGroup, emitToUser, removeUserFromRoom, isUserInRoom } from '../lib/socket.js';
import { createNotification } from './notifications.service.js';

const MAX_MSG_GRATUIT_PER_DAY = 5;
function todayKey() { return new Date().toISOString().slice(0, 10); }

// Selectul de profil compact reutilizat în toate query-urile
const memberProfileSelect = {
  id: true,
  profileElev: {
    select: {
      firstName: true,
      lastName: true,
      username: true,
      avatarUrl: true,
      school: true,
      class: true,
      city: true,
    },
  },
  profileAntreprenor: {
    select: {
      firstName: true,
      lastName: true,
      username: true,
      avatarUrl: true,
      company: true,
    },
  },
};

export async function createGroup(createdById: string, name: string, memberIds: string[]) {
  // Eliminăm duplicate și nu adăugăm creatorul de două ori
  const uniqueIds = [...new Set(memberIds)].filter((id) => id !== createdById);

  const group = await prisma.ideaGroup.create({
    data: {
      name: name.trim(),
      createdById,
      members: {
        create: [
          { userId: createdById, role: 'ADMIN' },
          ...uniqueIds.map((userId) => ({ userId, role: 'MEMBER' })),
        ],
      },
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastMessageAt: true,
      createdBy: { select: memberProfileSelect },
      members: {
        select: {
          role: true,
          joinedAt: true,
          user: { select: memberProfileSelect },
        },
      },
    },
  });
  return group;
}

export async function getGroups(userId: string) {
  return prisma.ideaGroup.findMany({
    where: { members: { some: { userId } } },
    orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      createdAt: true,
      lastMessageAt: true,
      createdById: true,
      members: {
        select: {
          role: true,
          user: {
            select: {
              id: true,
              profileElev: { select: { avatarUrl: true, firstName: true, lastName: true } },
              profileAntreprenor: { select: { avatarUrl: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      messages: {
        where: { type: { not: MessageType.EVENT } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, type: true, createdAt: true, senderId: true },
      },
    },
  });
}

export async function getGroupDetails(groupId: string, userId: string) {
  const group = await prisma.ideaGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastMessageAt: true,
      createdBy: { select: memberProfileSelect },
      members: {
        select: {
          role: true,
          joinedAt: true,
          user: { select: memberProfileSelect },
        },
      },
    },
  });
  if (!group) throw Object.assign(new Error('Grupul nu există.'), { status: 404 });
  const isMember = group.members.some((m) => m.user.id === userId);
  if (!isMember) throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });
  return group;
}

export async function getGroupMessages(groupId: string, userId: string, cursor?: string) {
  // Verificăm apartenența la grup
  const member = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member) throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });

  const PAGE = 30;
  const messages = await prisma.groupMessage.findMany({
    where: { groupId, ...(cursor ? { id: { lt: cursor } } : {}) },
    orderBy: { createdAt: 'desc' },
    take: PAGE + 1,
    select: {
      id: true,
      content: true,
      type: true,
      fileUrl: true,
      createdAt: true,
      sender: { select: memberProfileSelect },
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
  return { items, nextCursor: hasNextPage ? items[0]?.id : null, hasNextPage };
}

// Numele expeditorului din profil (elev sau antreprenor), fallback „Cineva".
function senderDisplayName(sender: {
  profileElev?: { firstName: string; lastName: string; username?: string | null } | null;
  profileAntreprenor?: { firstName: string; lastName: string; username?: string | null } | null;
}): string {
  const p = sender.profileElev ?? sender.profileAntreprenor;
  if (!p) return 'Cineva';
  const full = `${p.firstName} ${p.lastName}`.trim();
  return full || p.username || 'Cineva';
}

// Preview scurt pentru notificare — la fișiere afișăm „X a trimis o poză/un
// videoclip/un fișier" în loc de numele tehnic al fișierului.
function groupNotifPreview(type: MessageType, content: string, senderName: string): string {
  if (type === MessageType.IMAGE) return `${senderName} a trimis o poză`;
  if (type === MessageType.VIDEO) return `${senderName} a trimis un videoclip`;
  if (type === MessageType.PDF)   return `${senderName} a trimis un fișier`;
  const text = content.length > 60 ? content.slice(0, 57) + '...' : content;
  return `${senderName}: ${text}`;
}

export async function sendGroupMessage(
  groupId: string,
  senderId: string,
  senderPlan: Plan,
  content: string,
  replyToId?: string,
  type: MessageType = MessageType.TEXT,
  fileUrl?: string,
) {
  const member = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: senderId } },
  });
  if (!member) throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });

  // Limită zilnică cumulativă (chat 1-1 + grup) pentru utilizatorii Gratuit
  if (senderPlan === Plan.GRATUIT) {
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

  // Obținem toți membrii grupului pentru notificări
  const groupWithMembers = await prisma.ideaGroup.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      members: { select: { userId: true } },
    },
  });
  if (!groupWithMembers) throw Object.assign(new Error('Grupul nu există.'), { status: 404 });

  // Tranzacție: creăm mesajul și actualizăm lastMessageAt al grupului
  const [message] = await prisma.$transaction([
    prisma.groupMessage.create({
      data: { groupId, senderId, content, replyToId: replyToId ?? null, type, fileUrl: fileUrl ?? null },
      select: {
        id: true,
        content: true,
        type: true,
        fileUrl: true,
        createdAt: true,
        sender: { select: memberProfileSelect },
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
    }),
    prisma.ideaGroup.update({
      where: { id: groupId },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  // Emit real-time la toți membrii din room-ul grupului
  emitToGroup(groupId, 'group:message:new', { groupId, message });

  // Notificări + emit personal pentru membrii care nu sunt în room-ul grupului
  const otherMemberIds = groupWithMembers.members
    .map((m) => m.userId)
    .filter((id) => id !== senderId);

  for (const receiverId of otherMemberIds) {
    // Emit personal (prinde membrii cu app deschisă dar nu în chat de grup)
    emitToUser(receiverId, 'group:message:new', { groupId, message });

    // Dacă membrul e deja în grup, vede mesajul direct → fără notificare persistentă
    const inGroupChat = await isUserInRoom(`group:${groupId}`, receiverId);
    if (inGroupChat) continue;

    // Notificare persistentă (upsert per grup)
    prisma.notification.findFirst({
      where: {
        userId: receiverId,
        type: NotificationType.GROUP_MESSAGE,
        readAt: null,
        data: { path: ['groupId'], equals: groupId },
      },
      select: { id: true, data: true },
    }).then(async (existing) => {
      if (existing) {
        const count = parseInt(((existing.data as Record<string, string>)['count'] ?? '1'), 10) + 1;
        const n = await prisma.notification.update({
          where: { id: existing.id },
          data: { createdAt: new Date(), data: { groupId, senderId, count: count.toString() } },
        });
        emitToUser(receiverId, 'notification:new', n);
      } else {
        await createNotification({
          userId: receiverId,
          type: NotificationType.GROUP_MESSAGE,
          title: `Mesaj nou în ${groupWithMembers.name}`,
          body: groupNotifPreview(type, content, senderDisplayName(message.sender)),
          data: { groupId, senderId, count: '1' },
        });
      }
    }).catch(() => {});
  }

  return message;
}

// ─── Helper: selectul compact pentru un mesaj de grup (EVENT sau TEXT) ───────
const groupMsgSelect = {
  id: true, content: true, type: true, fileUrl: true, createdAt: true,
  sender: { select: memberProfileSelect },
  replyTo: null as null,
};

// ─── Helper: obține numele unui utilizator după ID ────────────────────────────
async function getUserName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      profileElev: { select: { firstName: true, lastName: true } },
      profileAntreprenor: { select: { firstName: true, lastName: true } },
    },
  });
  const p = u?.profileElev ?? u?.profileAntreprenor;
  return p ? `${p.firstName} ${p.lastName}` : 'Cineva';
}

// ─── Helper: emite un mesaj sistem (EVENT) în grup și actualizează lastMessageAt
async function createAndEmitEvent(groupId: string, senderId: string, content: string, memberIds: string[]) {
  const [eventMsg] = await prisma.$transaction([
    prisma.groupMessage.create({
      data: { groupId, senderId, content, type: MessageType.EVENT },
      select: {
        id: true, content: true, type: true, fileUrl: true, createdAt: true,
        sender: { select: memberProfileSelect },
      },
    }),
    prisma.ideaGroup.update({ where: { id: groupId }, data: { lastMessageAt: new Date() } }),
  ]);
  const payload = { groupId, message: { ...eventMsg, replyTo: null } };
  emitToGroup(groupId, 'group:message:new', payload);
  memberIds.forEach((id) => emitToUser(id, 'group:message:new', payload));
}

export async function updateGroupName(groupId: string, requesterId: string, name: string) {
  const member = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: requesterId } },
  });
  if (!member) throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });

  const [actorName, group] = await Promise.all([
    getUserName(requesterId),
    prisma.ideaGroup.findUnique({ where: { id: groupId }, select: { members: { select: { userId: true } } } }),
  ]);
  if (!group) throw Object.assign(new Error('Grupul nu există.'), { status: 404 });

  const updated = await prisma.ideaGroup.update({
    where: { id: groupId },
    data: { name: name.trim() },
    select: { id: true, name: true, avatarUrl: true },
  });

  const memberIds = group.members.map((m) => m.userId).filter((id) => id !== requesterId);
  const updatePayload = { groupId, name: updated.name, avatarUrl: updated.avatarUrl };
  emitToGroup(groupId, 'group:updated', updatePayload);
  memberIds.forEach((id) => emitToUser(id, 'group:updated', updatePayload));

  // Mesaj sistem în chat
  await createAndEmitEvent(groupId, requesterId, `${actorName} a redenumit grupul în „${updated.name}"`, memberIds);

  return updated;
}

export async function addGroupMember(groupId: string, requesterId: string, userId: string) {
  const requesterMember = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: requesterId } },
  });
  if (!requesterMember) {
    throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });
  }

  const [actorName, newUserName, group] = await Promise.all([
    getUserName(requesterId),
    getUserName(userId),
    prisma.ideaGroup.findUnique({
      where: { id: groupId },
      select: { name: true, members: { select: { userId: true } } },
    }),
  ]);
  if (!group) throw Object.assign(new Error('Grupul nu există.'), { status: 404 });

  const newMember = await prisma.ideaGroupMember.create({ data: { groupId, userId, role: 'MEMBER' } });

  // Obținem datele noului user pentru emit
  const newUserData = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      profileElev: { select: { avatarUrl: true, firstName: true, lastName: true } },
      profileAntreprenor: { select: { avatarUrl: true, firstName: true, lastName: true } },
    },
  });

  const allMemberIds = [...group.members.map((m) => m.userId), userId];
  const otherIds = allMemberIds.filter((id) => id !== requesterId);

  // Emit: member adăugat în timp real (toți membrii actualizează lista)
  const memberPayload = { groupId, member: { role: 'MEMBER', user: newUserData } };
  emitToGroup(groupId, 'group:member:added', memberPayload);
  allMemberIds.forEach((id) => emitToUser(id, 'group:member:added', memberPayload));

  // Mesaj sistem în chat
  await createAndEmitEvent(groupId, requesterId, `${actorName} l-a adăugat pe ${newUserName} în grup`, otherIds);

  return newMember;
}

export async function updateGroupAvatar(groupId: string, requesterId: string, avatarUrl: string) {
  const member = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: requesterId } },
  });
  if (!member) throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });

  const [actorName, group] = await Promise.all([
    getUserName(requesterId),
    prisma.ideaGroup.findUnique({ where: { id: groupId }, select: { name: true, members: { select: { userId: true } } } }),
  ]);
  if (!group) throw Object.assign(new Error('Grupul nu există.'), { status: 404 });

  const updated = await prisma.ideaGroup.update({
    where: { id: groupId },
    data: { avatarUrl },
    select: { id: true, name: true, avatarUrl: true },
  });

  const memberIds = group.members.map((m) => m.userId).filter((id) => id !== requesterId);
  const updatePayload = { groupId, name: updated.name, avatarUrl: updated.avatarUrl };
  emitToGroup(groupId, 'group:updated', updatePayload);
  memberIds.forEach((id) => emitToUser(id, 'group:updated', updatePayload));

  await createAndEmitEvent(groupId, requesterId, `${actorName} a schimbat poza grupului`, memberIds);

  return updated;
}

export async function removeGroupMember(groupId: string, requesterId: string, userId: string) {
  const requesterMember = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: requesterId } },
  });
  // Adminul poate scoate pe oricine; un user se poate scoate singur (leave group)
  if (!requesterMember || (requesterMember.role !== 'ADMIN' && requesterId !== userId)) {
    throw Object.assign(new Error('Permisiune insuficientă.'), { status: 403 });
  }
  const deleted = await prisma.ideaGroupMember.delete({
    where: { groupId_userId: { groupId, userId } },
  });

  // Scoatem forțat socket-urile membrului din camera grupului — altfel ar continua
  // să primească mesajele grupului în timp real deși nu mai e membru.
  removeUserFromRoom(userId, `group:${groupId}`);

  return deleted;
}
