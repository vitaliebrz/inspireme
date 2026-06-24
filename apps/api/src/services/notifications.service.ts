import { Resend } from 'resend';
import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const resend = new Resend(process.env['RESEND_API_KEY'] ?? '');
const FROM_EMAIL = process.env['FROM_EMAIL'] ?? 'noreply@inspireme.ro';
const APP_URL = process.env['APP_URL'] ?? 'http://localhost:5173';

// ─────────────────────────────────────────────
// CREARE NOTIFICARE IN-APP
// ─────────────────────────────────────────────

export async function createNotification({
  userId, type, title, body, data,
}: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  return prisma.notification.create({
    data: { userId, type, title, body, data: data ?? {} },
    select: { id: true, type: true, title: true, body: true, data: true, createdAt: true, readAt: true },
  });
}

// ─────────────────────────────────────────────
// LISTARE NOTIFICĂRI
// ─────────────────────────────────────────────

export async function getNotifications(userId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, type: true, title: true, body: true, data: true, createdAt: true, readAt: true },
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// ─────────────────────────────────────────────
// MARCARE CA CITITE
// ─────────────────────────────────────────────

export async function markAsRead(notificationId: string, userId: string) {
  const notif = await prisma.notification.findUnique({ where: { id: notificationId }, select: { userId: true } });
  if (!notif || notif.userId !== userId) {
    throw Object.assign(new Error('Notificare negăsită.'), { status: 404 });
  }
  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
    select: { id: true, readAt: true },
  });
}

export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// EMAIL — Resend (doar pentru notificări critice)
// ─────────────────────────────────────────────

export async function sendConnectionRequestEmail(toEmail: string, fromName: string, ideaTitle: string) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: `${fromName} vrea să se conecteze cu tine pe InspireMe`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Cerere nouă de conectare</h2>
        <p><strong>${fromName}</strong> a trimis o cerere de conectare pentru ideea ta <strong>"${ideaTitle}"</strong>.</p>
        <p>Intră în cont pentru a accepta sau refuza cererea.</p>
        <a href="${APP_URL}/chat" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi cererea
        </a>
      </div>
    `,
  });
}

export async function sendGiveawayWinnerEmail(toEmail: string, winnerName: string, giveawayTitle: string, antreprenorName: string) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: `🎉 Ai câștigat giveaway-ul "${giveawayTitle}"!`,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #f6a623;">Felicitări, ${winnerName}! 🏆</h2>
        <p>Ai fost ales câștigătorul giveaway-ului <strong>"${giveawayTitle}"</strong> lansat de <strong>${antreprenorName}</strong>.</p>
        <p>Antreprenorul te va contacta în curând pentru a discuta investiția.</p>
        <a href="${APP_URL}/giveaways" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi detalii
        </a>
      </div>
    `,
  });
}

export async function sendAccountWarningEmail(toEmail: string, daysUntilDelete: number) {
  const subject = daysUntilDelete > 30
    ? 'Contul tău InspireMe va fi șters în 35 de zile'
    : 'Ultimul avertisment: contul tău va fi șters în 11 zile';

  await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject,
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #ef4444;">Avertisment cont InspireMe</h2>
        <p>Contul tău este inactiv de mai bine de ${365 - daysUntilDelete} de zile.</p>
        <p>Conform politicii noastre GDPR, conturile inactive vor fi șterse automat după 365 de zile.</p>
        <p>Dacă nu dorești ștergerea, logheaz-te în cont în următoarele <strong>${daysUntilDelete} zile</strong>.</p>
        <a href="${APP_URL}/login" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Loghează-te acum
        </a>
      </div>
    `,
  });
}

export async function sendPaymentFailedEmail(toEmail: string) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: 'Plata abonamentului InspireMe a eșuat',
    html: `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Problemă la plată</h2>
        <p>Nu am reușit să procesăm plata pentru abonamentul tău Pro.</p>
        <p>Te rugăm să actualizezi metoda de plată pentru a evita pierderea accesului Pro.</p>
        <a href="${APP_URL}/subscriptions" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Actualizează plata
        </a>
      </div>
    `,
  });
}
