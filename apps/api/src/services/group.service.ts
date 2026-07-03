import { prisma } from '../lib/prisma.js';
import { emitToConversation } from '../lib/socket.js';

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
      city: true,
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
      createdAt: true,
      lastMessageAt: true,
      members: {
        take: 5,
        select: {
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
    },
  });

  const hasNextPage = messages.length > PAGE;
  const items = messages.slice(0, PAGE).reverse();
  return { items, nextCursor: hasNextPage ? items[0]?.id : null, hasNextPage };
}

export async function sendGroupMessage(groupId: string, senderId: string, content: string) {
  const member = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: senderId } },
  });
  if (!member) throw Object.assign(new Error('Nu ești membru al acestui grup.'), { status: 403 });

  // Tranzacție: creăm mesajul și actualizăm lastMessageAt al grupului
  const [message] = await prisma.$transaction([
    prisma.groupMessage.create({
      data: { groupId, senderId, content },
      select: {
        id: true,
        content: true,
        type: true,
        fileUrl: true,
        createdAt: true,
        sender: { select: memberProfileSelect },
      },
    }),
    prisma.ideaGroup.update({
      where: { id: groupId },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  // Emit real-time la toți membrii din room-ul grupului
  // Refolosim emitToConversation cu prefix "group:" pentru a evita conflicte cu conversațiile 1-1
  emitToConversation(`group:${groupId}`, 'group:message:new', { groupId, message });

  return message;
}

export async function addGroupMember(groupId: string, requesterId: string, userId: string) {
  const requesterMember = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: requesterId } },
  });
  if (!requesterMember || requesterMember.role !== 'ADMIN') {
    throw Object.assign(new Error('Doar adminul poate adăuga membri.'), { status: 403 });
  }
  return prisma.ideaGroupMember.create({ data: { groupId, userId, role: 'MEMBER' } });
}

export async function removeGroupMember(groupId: string, requesterId: string, userId: string) {
  const requesterMember = await prisma.ideaGroupMember.findUnique({
    where: { groupId_userId: { groupId, userId: requesterId } },
  });
  // Adminul poate scoate pe oricine; un user se poate scoate singur (leave group)
  if (!requesterMember || (requesterMember.role !== 'ADMIN' && requesterId !== userId)) {
    throw Object.assign(new Error('Permisiune insuficientă.'), { status: 403 });
  }
  return prisma.ideaGroupMember.delete({
    where: { groupId_userId: { groupId, userId } },
  });
}
