import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sendSupportReplyEmail } from '../lib/email.js';
import { emitToSupportRoom, isUserInRoom } from '../lib/socket.js';
import { createNotification } from './notifications.service.js';

const MSG_SELECT = {
  id: true, content: true, isAdmin: true, senderId: true, createdAt: true,
  sender: {
    select: {
      profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
      profileAntreprenor: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  },
} as const;

const TICKET_SELECT = {
  id: true, name: true, email: true, status: true, createdAt: true,
  user: {
    select: {
      id: true, role: true,
      profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
      profileAntreprenor: { select: { firstName: true, lastName: true, avatarUrl: true } },
    },
  },
  messages: { select: MSG_SELECT, orderBy: { createdAt: 'desc' as const }, take: 1 },
} as const;

// ─── ANONIM (login page, cont suspendat) ─────

export async function prismaCreateAnonymousTicket({ name, email, message }: { name: string; email: string; message: string }) {
  const ticket = await prisma.supportTicket.create({ data: { name, email, message } });
  await prisma.supportMessage.create({
    data: { ticketId: ticket.id, isAdmin: false, content: message },
  });
  return ticket;
}

// ─── UTILIZATOR ───────────────────────────────

export async function getOrCreateUserTicket(userId: string, name: string, email: string) {
  let ticket = await prisma.supportTicket.findUnique({ where: { userId } });
  if (!ticket) {
    ticket = await prisma.supportTicket.create({ data: { userId, name, email } });
  }
  return ticket;
}

export async function getUserTicketWithMessages(userId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { userId },
    select: {
      id: true, status: true, createdAt: true,
      messages: { select: MSG_SELECT, orderBy: { createdAt: 'asc' } },
    },
  });
  return ticket;
}

export async function sendUserMessage(userId: string, content: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { userId } });
  if (!ticket) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (ticket.status === 'CLOSED') throw Object.assign(new Error('Conversația a fost închisă.'), { status: 400 });

  const msg = await prisma.supportMessage.create({
    data: { ticketId: ticket.id, senderId: userId, isAdmin: false, content },
    select: MSG_SELECT,
  });

  if (ticket.status !== 'OPEN') {
    await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: 'OPEN' } });
  }

  emitToSupportRoom(ticket.id, msg);

  // Notifică adminii că a sosit un mesaj nou de suport — dar NU pe cei care sunt
  // deja în conversația de suport (o văd direct, prin emitToSupportRoom de mai sus).
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
  for (const admin of admins) {
    if (await isUserInRoom(`support:${ticket.id}`, admin.id)) continue;
    createNotification({
      userId: admin.id,
      type: NotificationType.SUPPORT_MESSAGE,
      title: 'Mesaj nou suport',
      body: `${ticket.name}: ${content.slice(0, 80)}`,
      data: { ticketId: ticket.id },
    }).catch(() => null);
  }

  return { ticketId: ticket.id, message: msg };
}

// ─── ADMIN ────────────────────────────────────

// Adminul inițiază (sau redeschide) conversația de suport cu un utilizator anume.
// Din partea userului va apărea ca „Suport InspireMe"; din partea adminului ca chat 1:1.
export async function startTicketForUser(targetUserId: string) {
  const u = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      email: true, isDeleted: true, role: true,
      profileElev: { select: { firstName: true, lastName: true } },
      profileAntreprenor: { select: { firstName: true, lastName: true } },
    },
  });
  if (!u || u.isDeleted) throw Object.assign(new Error('Utilizatorul nu există.'), { status: 404 });
  if (u.role === 'ADMIN') throw Object.assign(new Error('Nu poți deschide suport cu un alt admin.'), { status: 400 });

  const p = u.profileElev ?? u.profileAntreprenor;
  const name = (p ? `${p.firstName} ${p.lastName}`.trim() : '') || u.email;
  const ticket = await getOrCreateUserTicket(targetUserId, name, u.email);
  return { ticketId: ticket.id };
}

export async function getAdminTickets() {
  return prisma.supportTicket.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: TICKET_SELECT,
  });
}

export async function getAdminTicketMessages(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, status: true, name: true, email: true, createdAt: true,
      user: { select: { id: true, role: true,
        profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
        profileAntreprenor: { select: { firstName: true, lastName: true, avatarUrl: true } },
      }},
      messages: { select: MSG_SELECT, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!ticket) throw Object.assign(new Error('Ticket negăsit.'), { status: 404 });
  return ticket;
}

export async function sendAdminMessage(ticketId: string, adminId: string, content: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      user: {
        select: {
          email: true,
          profileElev: { select: { firstName: true } },
          profileAntreprenor: { select: { firstName: true } },
        },
      },
    },
  });
  if (!ticket) throw Object.assign(new Error('Ticket negăsit.'), { status: 404 });

  const msg = await prisma.supportMessage.create({
    data: { ticketId, senderId: adminId, isAdmin: true, content },
    select: MSG_SELECT,
  });

  emitToSupportRoom(ticketId, msg);

  // Notifică utilizatorul că a primit un răspuns — dar NU dacă e deja în conversația
  // de suport (o vede direct, prin emitToSupportRoom de mai sus).
  if (ticket.userId && !(await isUserInRoom(`support:${ticketId}`, ticket.userId))) {
    createNotification({
      userId: ticket.userId,
      type: NotificationType.SUPPORT_MESSAGE,
      title: 'Răspuns suport InspireMe',
      body: content.slice(0, 80),
      data: { ticketId },
    }).catch(() => null);
  }

  // Trimite email de notificare utilizatorului (non-blocking)
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';
  const toEmail = ticket.user?.email ?? ticket.email;
  const firstName = ticket.user?.profileElev?.firstName
    ?? ticket.user?.profileAntreprenor?.firstName
    ?? ticket.name;
  const isAuthenticated = !!ticket.userId;
  const replyLink = isAuthenticated
    ? `${frontendUrl}/support-chat`
    : `${frontendUrl}/support-reply?tid=${ticket.id}&name=${encodeURIComponent(ticket.name)}&email=${encodeURIComponent(ticket.email)}`;
  sendSupportReplyEmail(toEmail, firstName, content, { replyLink }).catch(() => null);

  return msg;
}

// ─── PUBLIC (anonim, fără autentificare) ────────

export async function getPublicTicket(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true, status: true, name: true, email: true, createdAt: true,
      messages: {
        select: { id: true, content: true, isAdmin: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!ticket) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  return ticket;
}

export async function sendAnonymousReply(ticketId: string, email: string, content: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw Object.assign(new Error('Conversație negăsită.'), { status: 404 });
  if (ticket.email !== email) throw Object.assign(new Error('Email incorect.'), { status: 403 });
  if (ticket.status === 'CLOSED') throw Object.assign(new Error('Conversația a fost închisă.'), { status: 400 });

  const msg = await prisma.supportMessage.create({
    data: { ticketId, isAdmin: false, content },
    select: { id: true, content: true, isAdmin: true, createdAt: true },
  });

  if (ticket.status !== 'OPEN') {
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'OPEN' } });
  }

  emitToSupportRoom(ticketId, msg);
  return { ticketId, message: msg };
}

export async function resolveTicket(id: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw Object.assign(new Error('Ticket negăsit.'), { status: 404 });
  return prisma.supportTicket.update({
    where: { id },
    data: { status: 'CLOSED', resolvedAt: new Date() },
  });
}

export async function reopenTicket(id: string) {
  return prisma.supportTicket.update({
    where: { id },
    data: { status: 'OPEN', resolvedAt: null },
  });
}
