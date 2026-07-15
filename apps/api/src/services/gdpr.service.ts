import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { deleteUser } from './admin.service.js';

// ─────────────────────────────────────────────
// EXPORT DATE (GDPR) — adună toate datele personale ale userului
// ─────────────────────────────────────────────
export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, role: true, plan: true,
      createdAt: true, lastLogin: true, lastActivity: true,
      profileElev: true,
      profileAntreprenor: true,
    },
  });
  if (!user) throw Object.assign(new Error('Utilizator negăsit.'), { status: 404 });

  const [
    ideas, feedbackGiven, messagesSent, connectionRequests,
    giveawaysCreated, giveawayParticipations, collaborations,
    notifications, subscriptions, supportMessages,
  ] = await Promise.all([
    prisma.idea.findMany({
      where: { userId },
      select: {
        id: true, title: true, categories: true, problem: true, solution: true,
        targetAudience: true, tags: true, status: true, visibility: true,
        viewCount: true, createdAt: true,
      },
    }),
    prisma.feedback.findMany({
      where: { antreprenorId: userId },
      select: { ideaId: true, ratingGeneral: true, comment: true, interestedInCollab: true, createdAt: true },
    }),
    prisma.message.findMany({
      where: { senderId: userId },
      select: { conversationId: true, content: true, type: true, createdAt: true },
    }),
    prisma.connectionRequest.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true, ideaId: true, status: true, createdAt: true },
    }),
    prisma.giveaway.findMany({
      where: { antreprenorId: userId },
      select: { id: true, title: true, status: true, winnerId: true, createdAt: true },
    }),
    prisma.giveawayParticipant.findMany({
      where: { elevId: userId },
      select: { giveawayId: true, ideaId: true, joinedAt: true },
    }),
    prisma.collaboration.findMany({
      where: { OR: [{ elevId: userId }, { antreprenorId: userId }] },
      select: { ideaId: true, confirmedByElev: true, confirmedByAntreprenor: true, confirmedAt: true, createdAt: true },
    }),
    prisma.notification.findMany({
      where: { userId },
      select: { type: true, title: true, body: true, readAt: true, createdAt: true },
    }),
    prisma.subscription.findMany({
      where: { userId },
      select: { plan: true, currentPeriodEnd: true, cancelledAt: true, createdAt: true },
    }),
    prisma.supportMessage.findMany({
      where: { senderId: userId },
      select: { content: true, isAdmin: true, createdAt: true },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: user.id, email: user.email, role: user.role, plan: user.plan,
      createdAt: user.createdAt, lastLogin: user.lastLogin, lastActivity: user.lastActivity,
    },
    profile: user.profileElev ?? user.profileAntreprenor ?? null,
    ideas,
    feedbackGiven,
    messagesSent,
    connectionRequests,
    giveawaysCreated,
    giveawayParticipations,
    collaborations,
    notifications,
    subscriptions,
    supportMessages,
  };
}

// ─────────────────────────────────────────────
// ȘTERGERE CONT (GDPR) — self-service, cu confirmare parolă
// Reutilizează anonimizarea existentă (deleteUser fără adminId).
// ─────────────────────────────────────────────
export async function deleteOwnAccount(userId: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true, isDeleted: true },
  });
  if (!user) throw Object.assign(new Error('Utilizator negăsit.'), { status: 404 });
  if (user.isDeleted) throw Object.assign(new Error('Contul a fost deja șters.'), { status: 400 });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw Object.assign(new Error('Parolă incorectă.'), { status: 403 });

  await deleteUser(userId); // anonimizare GDPR (soft-delete + email/PII anonimizat)
  return { success: true };
}
