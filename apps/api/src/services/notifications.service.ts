import { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../lib/socket.js';
import { sendEmail as sendEmailBase } from '../lib/email.js';

const APP_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';

// Transport unificat — folosim singurul modul de email (lib/email.ts),
// care alege automat Mailtrap → Gmail → Resend. Evită logica duplicată.
async function sendEmail(to: string, subject: string, html: string) {
  await sendEmailBase({ to, subject, html });
}

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
  const notification = await prisma.notification.create({
    data: { userId, type, title, body, data: data ?? {} },
    select: { id: true, type: true, title: true, body: true, data: true, createdAt: true, readAt: true },
  });
  emitToUser(userId, 'notification:new', notification);
  return notification;
}

// ─────────────────────────────────────────────
// LISTARE NOTIFICĂRI
// ─────────────────────────────────────────────

export async function getNotifications(userId: string, unreadOnly = false) {
  const notifications = await prisma.notification.findMany({
    where: {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, type: true, title: true, body: true, data: true, createdAt: true, readAt: true },
  });

  // Îmbogățim toate notificările CONNECTION_REQUEST cu statusul curent al cererii
  // (necesar ca frontend-ul să ascundă butoanele Acceptă/Refuză după ce cererea a fost procesată)
  const connectionReqNotifs = notifications.filter((n) => n.type === NotificationType.CONNECTION_REQUEST);

  if (connectionReqNotifs.length === 0) return notifications;

  const requestIds = connectionReqNotifs
    .map((n) => (n.data as Record<string, string>)?.['requestId'])
    .filter((id): id is string => Boolean(id));

  const requests = await prisma.connectionRequest.findMany({
    where: { id: { in: requestIds } },
    select: {
      id: true,
      status: true,
      fromUser: {
        select: {
          profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
          profileAntreprenor: { select: { firstName: true, lastName: true, avatarUrl: true } },
        },
      },
    },
  });

  const reqMap = new Map(requests.map((r) => [r.id, r]));

  return notifications.map((n) => {
    if (n.type !== NotificationType.CONNECTION_REQUEST) return n;
    const d = (n.data ?? {}) as Record<string, string>;

    const req = reqMap.get(d['requestId'] ?? '');
    if (!req) return n;

    const sp = req.fromUser.profileElev ?? req.fromUser.profileAntreprenor;
    const fromName = d['fromName'] || (sp ? `${sp.firstName} ${sp.lastName}`.trim() : '');

    return {
      ...n,
      ...(fromName ? { title: `${fromName} vrea să se conecteze cu tine` } : {}),
      data: {
        ...d,
        ...(fromName ? { fromName } : {}),
        ...(sp?.avatarUrl ? { fromAvatarUrl: sp.avatarUrl } : {}),
        requestStatus: req.status,
      },
    };
  });
}

export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

// Count-uri exacte pentru badge-uri (nelimitate — lista /notifications e plafonată la 50,
// deci numerele NU se pot calcula din ea). Agregăm toate necititele (rânduri mici: type+data).
export async function getNotificationCounts(userId: string) {
  const unread = await prisma.notification.findMany({
    where: { userId, readAt: null },
    select: { type: true, data: true },
  });

  let messages = 0;
  const byConversation: Record<string, number> = {};
  const byGroup: Record<string, number> = {};
  const bySupport: Record<string, number> = {};

  for (const n of unread) {
    const d = (n.data ?? {}) as Record<string, string>;
    if (n.type === NotificationType.MESSAGE_NEW) {
      messages++;
      if (d['conversationId']) byConversation[d['conversationId']] = (byConversation[d['conversationId']] ?? 0) + 1;
    } else if (n.type === NotificationType.GROUP_MESSAGE) {
      messages++;
      if (d['groupId']) byGroup[d['groupId']] = (byGroup[d['groupId']] ?? 0) + 1;
    } else if (n.type === NotificationType.SUPPORT_MESSAGE) {
      messages++;
      if (d['ticketId']) bySupport[d['ticketId']] = (bySupport[d['ticketId']] ?? 0) + 1;
    }
  }

  return { total: unread.length, messages, byConversation, byGroup, bySupport };
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

export async function markReadByConversation(userId: string, conversationId: string) {
  await prisma.notification.updateMany({
    where: {
      userId,
      type: NotificationType.MESSAGE_NEW,
      readAt: null,
      data: { path: ['conversationId'], equals: conversationId },
    },
    data: { readAt: new Date() },
  });
  return { success: true };
}

export async function markReadByGroup(userId: string, groupId: string) {
  await prisma.notification.updateMany({
    where: {
      userId,
      type: NotificationType.GROUP_MESSAGE,
      readAt: null,
      data: { path: ['groupId'], equals: groupId },
    },
    data: { readAt: new Date() },
  });
  return { success: true };
}

export async function markReadByTicket(userId: string, ticketId: string) {
  await prisma.notification.updateMany({
    where: {
      userId,
      type: NotificationType.SUPPORT_MESSAGE,
      readAt: null,
      data: { path: ['ticketId'], equals: ticketId },
    },
    data: { readAt: new Date() },
  });
  return { success: true };
}

// ─────────────────────────────────────────────
// EMAIL — Mailtrap în dev, Resend în production
// ─────────────────────────────────────────────

export async function sendConnectionRequestEmail(toEmail: string, fromName: string, ideaTitle: string | null) {
  const intro = ideaTitle
    ? `<strong>${fromName}</strong> a trimis o cerere de conectare pentru ideea ta <strong>"${ideaTitle}"</strong>.`
    : `<strong>${fromName}</strong> vrea să intre în contact cu tine.`;
  await sendEmail(
    toEmail,
    `${fromName} vrea să se conecteze cu tine pe InspireMe`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Cerere nouă de conectare</h2>
        <p>${intro}</p>
        <p>Intră în cont pentru a accepta sau refuza cererea.</p>
        <a href="${APP_URL}/chat" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi cererea
        </a>
      </div>
    `,
  );
}

export async function sendIdeaPublishedEmail(toEmail: string, ideaTitle: string, ideaId: string) {
  await sendEmail(
    toEmail,
    `Ideea ta „${ideaTitle}" a fost publicată! 🎉`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Idee publicată cu succes</h2>
        <p>Ideea ta <strong>"${ideaTitle}"</strong> este acum live în feed și vizibilă antreprenorilor de pe InspireMe.</p>
        <a href="${APP_URL}/idea/${ideaId}" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi ideea ta
        </a>
      </div>
    `,
  );
}

export async function sendIdeaFeedbackEmail(toEmail: string, ideaTitle: string, ideaId: string, fromName: string) {
  await sendEmail(
    toEmail,
    `${fromName} ți-a lăsat feedback pe „${ideaTitle}"`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Feedback nou pe ideea ta ⭐</h2>
        <p><strong>${fromName}</strong> a evaluat ideea ta <strong>"${ideaTitle}"</strong>.</p>
        <p>Intră în cont pentru a vedea evaluarea și comentariul.</p>
        <a href="${APP_URL}/idea/${ideaId}" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi feedback-ul
        </a>
      </div>
    `,
  );
}

export async function sendGiveawayJoinEmail(toEmail: string, giveawayTitle: string) {
  await sendEmail(
    toEmail,
    `Participare confirmată la „${giveawayTitle}"`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Ești înscris la giveaway! 🎯</h2>
        <p>Te-ai înscris cu succes la giveaway-ul <strong>"${giveawayTitle}"</strong>.</p>
        <p>Vei fi notificat imediat ce se alege câștigătorul.</p>
        <a href="${APP_URL}/giveaways" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi giveaway-ul
        </a>
      </div>
    `,
  );
}

export async function sendGiveawayLeaveEmail(toEmail: string, giveawayTitle: string) {
  await sendEmail(
    toEmail,
    `Ai retras participarea la „${giveawayTitle}"`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Participare retrasă</h2>
        <p>Ai retras participarea la giveaway-ul <strong>"${giveawayTitle}"</strong>.</p>
        <p>Poți participa din nou înainte de închiderea giveaway-ului dacă te răzgândești.</p>
        <a href="${APP_URL}/giveaways" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi giveaway-uri
        </a>
      </div>
    `,
  );
}

export async function sendGiveawayWinnerEmail(toEmail: string, winnerName: string, giveawayTitle: string, antreprenorName: string) {
  await sendEmail(
    toEmail,
    `🎉 Ai câștigat giveaway-ul "${giveawayTitle}"!`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #f6a623;">Felicitări, ${winnerName}! 🏆</h2>
        <p>Ai fost ales câștigătorul giveaway-ului <strong>"${giveawayTitle}"</strong> lansat de <strong>${antreprenorName}</strong>.</p>
        <p>Antreprenorul te va contacta în curând pentru a discuta investiția.</p>
        <a href="${APP_URL}/giveaways" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi detalii
        </a>
      </div>
    `,
  );
}

export async function sendGiveawayWinnerAntreprenorEmail(
  toEmail: string,
  antreprenorName: string,
  winnerName: string,
  giveawayTitle: string,
  ideaTitle: string,
  giveawayId: string,
) {
  await sendEmail(
    toEmail,
    `Câștigătorul giveaway-ului "${giveawayTitle}" a fost ales 🏆`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Câștigător ales pentru giveaway-ul tău</h2>
        <p>Salut, ${antreprenorName}!</p>
        <p><strong>${winnerName}</strong> a fost ales câștigătorul giveaway-ului <strong>"${giveawayTitle}"</strong> cu ideea <strong>"${ideaTitle}"</strong>.</p>
        <p>Următorul pas este să contactezi câștigătorul și să confirmi investiția promisă în această idee.</p>
        <a href="${APP_URL}/giveaways/${giveawayId}" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Confirmă investiția
        </a>
      </div>
    `,
  );
}

// Investiție giveaway confirmată de ambele părți — trimis câștigătorului,
// antreprenorului creator și adminilor.
export async function sendGiveawayInvestmentConfirmedEmail(
  toEmail: string,
  giveawayTitle: string,
  antreprenorName: string,
  winnerName: string,
  giveawayId: string,
) {
  await sendEmail(
    toEmail,
    `Investiție confirmată — „${giveawayTitle}" ✅`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Investiție confirmată de ambele părți ✅</h2>
        <p><strong>${antreprenorName}</strong> și <strong>${winnerName}</strong> au confirmat investiția pentru giveaway-ul <strong>"${giveawayTitle}"</strong>.</p>
        <p>Colaborarea este acum oficializată.</p>
        <a href="${APP_URL}/giveaways/${giveawayId}" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi giveaway-ul
        </a>
      </div>
    `,
  );
}

export async function sendAccountWarningEmail(toEmail: string, daysUntilDelete: number) {
  const subject = daysUntilDelete > 30
    ? 'Contul tău InspireMe va fi șters în 35 de zile'
    : 'Ultimul avertisment: contul tău va fi șters în 11 zile';

  await sendEmail(
    toEmail,
    subject,
    `
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
  );
}

export async function sendPaymentFailedEmail(toEmail: string) {
  await sendEmail(
    toEmail,
    'Plata abonamentului InspireMe a eșuat',
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Problemă la plată</h2>
        <p>Nu am reușit să procesăm plata pentru abonamentul tău Pro.</p>
        <p>Te rugăm să actualizezi metoda de plată pentru a evita pierderea accesului Pro.</p>
        <a href="${APP_URL}/subscriptions" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Actualizează plata
        </a>
      </div>
    `,
  );
}

export async function sendProActivatedEmail(toEmail: string, role: 'ELEV' | 'ANTREPRENOR') {
  const benefits = role === 'ELEV'
    ? ['Idei nelimitate', '10 imagini per idee', 'Mesaje nelimitate în chat', 'Prioritate în feed (scor +100)']
    : ['30 cereri de conectare/zi', 'Lansare giveaway-uri', 'Prioritate în feed antreprenori', 'Acces statistici avansate'];

  await sendEmail(
    toEmail,
    'Planul Pro a fost activat! 🎉',
    `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1117;color:#f0f2f8;border-radius:16px;overflow:hidden;">
        <div style="background:#f6a623;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;font-size:28px;color:#fff;font-weight:800;">InspireMe Pro</h1>
        </div>
        <div style="padding:40px;">
          <h2 style="margin:0 0 12px;font-size:22px;color:#f0f2f8;">Plata a fost procesată cu succes! 🎉</h2>
          <p style="color:#8892a4;line-height:1.6;margin:0 0 20px;">
            Abonamentul tău <strong style="color:#f0f2f8">Pro</strong> este activ chiar acum. Ai deblocat:
          </p>
          <ul style="color:#8892a4;line-height:1.9;margin:0 0 24px;padding-left:20px;">
            ${benefits.map((b) => `<li>${b}</li>`).join('')}
          </ul>
          <a href="${APP_URL}/subscriptions"
            style="display:inline-block;background:#f6a623;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
            Vezi abonamentul →
          </a>
          <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0;" />
          <p style="color:#8892a4;font-size:13px;margin:0;">
            Poți anula oricând din aplicație — anularea e imediată, nu la finalul perioadei plătite.
          </p>
        </div>
      </div>
    `,
  );
}

export async function sendDowngradeEmail(
  toEmail: string,
  info: { reason: string; ideasMadePrivate: string[]; giveawaysWithdrawn: string[] },
) {
  const { reason, ideasMadePrivate, giveawaysWithdrawn } = info;

  await sendEmail(
    toEmail,
    'Ai trecut la planul Gratuit',
    `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f1117;color:#f0f2f8;border-radius:16px;overflow:hidden;">
        <div style="background:#2d3748;padding:32px 40px;text-align:center;">
          <h1 style="margin:0;font-size:24px;color:#fff;font-weight:800;">InspireMe</h1>
        </div>
        <div style="padding:40px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#f0f2f8;">Contul tău e acum pe planul Gratuit</h2>
          <p style="color:#8892a4;line-height:1.6;margin:0 0 20px;">${reason}</p>

          ${ideasMadePrivate.length > 0 ? `
            <p style="color:#f0f2f8;font-weight:600;margin:0 0 8px;">
              ${ideasMadePrivate.length === 1 ? 'Această idee a devenit privată' : 'Aceste idei au devenit private'} (planul Gratuit permite o singură idee publică):
            </p>
            <ul style="color:#8892a4;line-height:1.9;margin:0 0 20px;padding-left:20px;">
              ${ideasMadePrivate.map((t) => `<li>${t}</li>`).join('')}
            </ul>
            <p style="color:#8892a4;line-height:1.6;margin:0 0 20px;">
              Ideile nu au fost șterse — sunt doar private și nu pot fi făcute publice din nou până nu activezi Pro.
            </p>
          ` : ''}

          ${giveawaysWithdrawn.length > 0 ? `
            <p style="color:#f0f2f8;font-weight:600;margin:0 0 8px;">
              ${giveawaysWithdrawn.length === 1 ? 'Participarea la acest giveaway a fost retrasă' : 'Participările la aceste giveaway-uri au fost retrase'} (idei private nu pot concura):
            </p>
            <ul style="color:#8892a4;line-height:1.9;margin:0 0 24px;padding-left:20px;">
              ${giveawaysWithdrawn.map((t) => `<li>${t}</li>`).join('')}
            </ul>
          ` : ''}

          <a href="${APP_URL}/subscriptions"
            style="display:inline-block;background:#f6a623;color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:700;font-size:15px;">
            Reactivează Pro →
          </a>
        </div>
      </div>
    `,
  );
}

export async function sendCategoryDeletedEmail(toEmail: string, categoryName: string, reason: string) {
  await sendEmail(
    toEmail,
    `Categoria „${categoryName}" a fost eliminată`,
    `
      <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
        <h2 style="color: #2d3748;">Categorie eliminată</h2>
        <p>Categoria <strong>${categoryName}</strong> pe care ai adăugat-o a fost eliminată de echipa InspireMe.</p>
        <p style="color: #4a5568;">${reason}</p>
        <p>Categoria a fost eliminată automat din ideile tale. Te poți întoarce și selecta o categorie potrivită din lista existentă.</p>
        <a href="${APP_URL}/profile/me" style="display: inline-block; background: #f6a623; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 16px;">
          Vezi ideile mele
        </a>
      </div>
    `,
  );
}
