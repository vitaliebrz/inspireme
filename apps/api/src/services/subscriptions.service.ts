import Stripe from 'stripe';
import { Plan, Role, NotificationType, IdeaVisibility, GiveawayStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import {
  sendPaymentFailedEmail, sendProActivatedEmail, sendDowngradeEmail, createNotification,
} from './notifications.service.js';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '', { apiVersion: '2025-02-24.acacia' });

// Prețuri lunare/anuale din env (configurate în Stripe Dashboard)
function getPriceId(role: Role, interval: 'month' | 'year'): string {
  if (role === Role.ELEV) {
    return interval === 'month'
      ? (process.env['STRIPE_ELEV_MONTHLY_PRICE_ID'] ?? '')
      : (process.env['STRIPE_ELEV_YEARLY_PRICE_ID'] ?? '');
  }
  return interval === 'month'
    ? (process.env['STRIPE_ANTREPRENOR_MONTHLY_PRICE_ID'] ?? '')
    : (process.env['STRIPE_ANTREPRENOR_YEARLY_PRICE_ID'] ?? '');
}

// ─────────────────────────────────────────────
// CREARE SESIUNE CHECKOUT STRIPE
// ─────────────────────────────────────────────

export async function createCheckoutSession(userId: string, userRole: Role, interval: 'month' | 'year') {
  // Adminii au acces Pro din oficiu, nu prin Stripe — niciun checkout real nu trebuie
  // creat pentru ei, indiferent cine apelează funcția asta.
  if (userRole === Role.ADMIN) {
    throw Object.assign(new Error('Conturile de admin nu pot cumpăra abonamente.'), { status: 403 });
  }

  const priceId = getPriceId(userRole, interval);
  if (!priceId) throw Object.assign(new Error('Prețul nu a fost configurat.'), { status: 500 });

  // Obținem sau creăm customer Stripe
  let subscription = await prisma.subscription.findFirst({
    where: { userId },
    select: { stripeCustomerId: true },
  });

  let customerId = subscription?.stripeCustomerId ?? undefined;
  if (!customerId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw Object.assign(new Error('Utilizator negăsit.'), { status: 404 });
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
  }

  const appUrl = process.env['APP_URL'] ?? 'http://localhost:5173';
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/subscriptions?success=1`,
    cancel_url: `${appUrl}/subscriptions?cancelled=1`,
    metadata: { userId, interval },
    allow_promotion_codes: true,
    locale: 'ro',
  });

  return { url: session.url };
}

// ─────────────────────────────────────────────
// PORTAL BILLING (management abonament)
// ─────────────────────────────────────────────

export async function createBillingPortalSession(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    select: { stripeCustomerId: true },
  });
  if (!subscription?.stripeCustomerId) {
    throw Object.assign(new Error('Nu ai un abonament activ.'), { status: 404 });
  }

  const appUrl = process.env['APP_URL'] ?? 'http://localhost:5173';
  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${appUrl}/subscriptions`,
  });

  return { url: session.url };
}

// ─────────────────────────────────────────────
// CONSECINȚE DOWNGRADE LA GRATUIT
// La orice tranziție PRO → GRATUIT (anulare, expirare naturală, rambursare sau
// contestație de plată), aplicăm imediat toate restricțiile planului Gratuit:
// - păstrăm publică doar cea mai veche idee (prima postată); restul devin PRIVATE —
//   nu se șterg, dar nu mai pot fi făcute publice din nou decât cu un nou abonament
//   Pro (verificarea e în ideas.service.ts, la schimbarea vizibilității)
// - retragem automat acele idei din orice giveaway ACTIV (nu poți concura cu o idee
//   privată)
// - trimitem un email care rezumă exact ce s-a schimbat
// Idempotent: dacă userul e deja pe Gratuit, nu face nimic (evită emailuri duplicate
// dacă mai multe evenimente Stripe ajung pentru aceeași tranziție).
// ─────────────────────────────────────────────

async function applyGratuitDowngrade(
  userId: string,
  opts: { notificationTitle: string; emailReason: string },
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, email: true } });
  if (!user || user.plan === Plan.GRATUIT) return;

  await prisma.user.update({ where: { id: userId }, data: { plan: Plan.GRATUIT } });

  const publicIdeas = await prisma.idea.findMany({
    where: { userId, visibility: IdeaVisibility.PUBLIC },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true },
  });
  const madePrivate = publicIdeas.slice(1);

  let withdrawnGiveaways: string[] = [];
  if (madePrivate.length > 0) {
    const ideaIds = madePrivate.map((i) => i.id);
    await prisma.idea.updateMany({ where: { id: { in: ideaIds } }, data: { visibility: IdeaVisibility.PRIVAT } });

    const participations = await prisma.giveawayParticipant.findMany({
      where: { ideaId: { in: ideaIds }, giveaway: { status: GiveawayStatus.ACTIVE } },
      select: { id: true, giveaway: { select: { title: true } } },
    });
    if (participations.length > 0) {
      await prisma.giveawayParticipant.deleteMany({ where: { id: { in: participations.map((p) => p.id) } } });
      withdrawnGiveaways = participations.map((p) => p.giveaway.title);
    }
  }

  createNotification({
    userId,
    type: NotificationType.SYSTEM,
    title: opts.notificationTitle,
    body: madePrivate.length > 0
      ? `${madePrivate.length} ${madePrivate.length === 1 ? 'idee a devenit privată' : 'idei au devenit private'} — planul Gratuit permite o singură idee publică.`
      : 'Funcțiile Pro nu mai sunt disponibile.',
    data: { kind: 'plan_gratuit' },
  }).catch(() => {});

  if (user.email) {
    sendDowngradeEmail(user.email, {
      reason: opts.emailReason,
      ideasMadePrivate: madePrivate.map((i) => i.title),
      giveawaysWithdrawn: withdrawnGiveaways,
    }).catch(() => {});
  }
}

// ─────────────────────────────────────────────
// ANULARE ABONAMENT — imediată, nu la finalul perioadei plătite. Politica aleasă:
// niciun acces Pro rămas pe „gratis" după anulare, indiferent câte zile plătite
// mai rămâneau — fără reactivare ulterioară (Stripe nu permite „de-anularea" unui
// abonament deja închis; un nou Pro înseamnă un checkout nou).
// ─────────────────────────────────────────────

export async function cancelSubscription(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    select: { stripeSubscriptionId: true },
  });
  if (!subscription?.stripeSubscriptionId) {
    throw Object.assign(new Error('Nu ai un abonament activ.'), { status: 404 });
  }

  await stripe.subscriptions.cancel(subscription.stripeSubscriptionId).catch(() => {});

  await prisma.subscription.update({
    where: { stripeSubscriptionId: subscription.stripeSubscriptionId },
    data: { cancelledAt: new Date(), currentPeriodEnd: new Date() },
  });

  await applyGratuitDowngrade(userId, {
    notificationTitle: 'Abonamentul Pro a fost anulat',
    emailReason: 'Ai anulat abonamentul Pro din aplicație.',
  });

  return { success: true };
}

// ─────────────────────────────────────────────
// STATUS ABONAMENT CURENT
// ─────────────────────────────────────────────

export async function getSubscriptionStatus(userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId },
    select: { plan: true, currentPeriodEnd: true, cancelledAt: true, createdAt: true, stripePriceId: true },
  });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true },
  });

  const isActive = subscription && subscription.currentPeriodEnd && subscription.currentPeriodEnd > new Date();

  return {
    currentPlan: user?.plan ?? Plan.GRATUIT,
    role: user?.role,
    subscription: isActive ? subscription : null,
  };
}

// ─────────────────────────────────────────────
// REVOCARE ACCES PRO (rambursare / contestație de plată la bancă)
// Previne abuzul: userul plătește, apoi obține banii înapoi (rambursare completă sau
// chargeback la bancă), dar fără asta ar rămâne cu acces Pro până la finalul perioadei
// plătite (chiar un an, la abonamentul anual). Revocăm imediat — nu la period end — și
// anulăm abonamentul Stripe ca să nu se mai încerce nicio plată viitoare.
// ─────────────────────────────────────────────

async function revokeProAccess(
  stripeCustomerId: string,
  opts: { notificationTitle: string; emailReason: string },
): Promise<void> {
  const sub = await prisma.subscription.findFirst({
    where: { stripeCustomerId },
    select: { userId: true, stripeSubscriptionId: true },
  });
  if (!sub) return;

  if (sub.stripeSubscriptionId) {
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId).catch(() => {});
  }

  await prisma.subscription.updateMany({
    where: { stripeCustomerId },
    data: { cancelledAt: new Date(), currentPeriodEnd: new Date() },
  });

  await applyGratuitDowngrade(sub.userId, opts);
}

// ─────────────────────────────────────────────
// WEBHOOK STRIPE — procesare evenimente
// ─────────────────────────────────────────────

export async function handleStripeWebhook(payload: Buffer, signature: string) {
  const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch {
    throw Object.assign(new Error('Semnătură webhook invalidă.'), { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.['userId'];
      if (!userId || !session.subscription) break;

      const stripeSubscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = stripeSubscription.items.data[0]?.price.id ?? '';

      // Determinăm rolul din priceId pentru a seta planul corect
      await prisma.$transaction([
        prisma.subscription.upsert({
          where: { stripeSubscriptionId: session.subscription as string },
          create: {
            userId,
            plan: Plan.PRO,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            stripePriceId: priceId,
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
          },
          update: {
            currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
            cancelledAt: null,
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { plan: Plan.PRO },
        }),
      ]);

      // Confirmare activare Pro — notificare in-app + email, non-blocant
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true } });
      if (user && user.role !== Role.ADMIN) {
        createNotification({
          userId,
          type: NotificationType.SYSTEM,
          title: 'Planul Pro a fost activat! 🎉',
          body: 'Abonamentul tău Pro este activ acum. Bucură-te de toate beneficiile.',
          data: { kind: 'plan_pro' },
        }).catch(() => {});
        sendProActivatedEmail(user.email, user.role as 'ELEV' | 'ANTREPRENOR').catch(() => {});
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const sub = await prisma.subscription.findFirst({
        where: { stripeCustomerId: customerId },
        select: { userId: true },
      });
      if (sub) {
        // Notificăm userul — downgrade nu se face automat la primul eșec
        await prisma.notification.create({
          data: {
            userId: sub.userId,
            type: 'SYSTEM',
            title: 'Plata abonamentului a eșuat',
            body: 'Verifică metoda de plată pentru a evita pierderea accesului Pro.',
          },
        });
        const user = await prisma.user.findUnique({ where: { id: sub.userId }, select: { email: true } });
        if (user) sendPaymentFailedEmail(user.email).catch(() => {});
      }
      break;
    }

    // Orice cerere de anulare, chiar dacă vine din portalul Stripe (nu din butonul
    // nostru) — Stripe marchează asta ca cancel_at_period_end=true. Aplicăm aceeași
    // politică de anulare imediată: nu lăsăm abonamentul să „mai tragă" până la
    // finalul perioadei doar pentru că userul a folosit portalul, nu butonul din app.
    case 'customer.subscription.updated': {
      const stripeSubscriptionId = (event.data.object as Stripe.Subscription).id;
      const dbSub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId },
        select: { userId: true, cancelledAt: true },
      });
      if (!dbSub) break;

      // Re-citim prin SDK-ul nostru (versiune API fixată) în loc de payload-ul brut al
      // webhook-ului — versiunea contului Stripe poate muta current_period_end la nivel
      // de item, nu de abonament, iar payload-ul brut nu e de încredere pentru asta.
      const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);

      if (stripeSubscription.cancel_at_period_end && !dbSub.cancelledAt) {
        await stripe.subscriptions.cancel(stripeSubscriptionId).catch(() => {});
        await prisma.subscription.update({
          where: { stripeSubscriptionId },
          data: { cancelledAt: new Date(), currentPeriodEnd: new Date() },
        });
        await applyGratuitDowngrade(dbSub.userId, {
          notificationTitle: 'Abonamentul Pro a fost anulat',
          emailReason: 'Ai anulat abonamentul Pro din portalul de billing.',
        });
      } else {
        await prisma.subscription.update({
          where: { stripeSubscriptionId },
          data: { currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000) },
        });
      }
      break;
    }

    // Plasă de siguranță — dacă abonamentul ajunge oricum să fie șters la Stripe
    // (natural sau printr-o cale pe care n-am prins-o mai sus), aplicăm tot downgrade-ul.
    // Idempotent — dacă a fost deja aplicat, applyGratuitDowngrade nu face nimic în plus.
    case 'customer.subscription.deleted': {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
        select: { userId: true },
      });
      if (sub) {
        await prisma.subscription.update({
          where: { stripeSubscriptionId: stripeSubscription.id },
          data: { cancelledAt: new Date(), currentPeriodEnd: new Date() },
        });
        await applyGratuitDowngrade(sub.userId, {
          notificationTitle: 'Abonamentul Pro s-a încheiat',
          emailReason: 'Abonamentul tău Pro s-a încheiat.',
        });
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
      if (!customerId) break;

      // O rambursare parțială (gest comercial, ex. un discount aplicat ulterior) nu
      // trebuie să taie accesul — doar rambursarea integrală a plății.
      if (charge.amount_refunded < charge.amount) break;

      await revokeProAccess(customerId, {
        notificationTitle: 'Abonamentul Pro a fost anulat',
        emailReason: 'Plata a fost rambursată integral, așa că accesul Pro a fost revocat imediat.',
      });
      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id;
      if (!chargeId) break;

      const charge = await stripe.charges.retrieve(chargeId);
      const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
      if (!customerId) break;

      await revokeProAccess(customerId, {
        notificationTitle: 'Abonamentul Pro a fost suspendat',
        emailReason: 'Plata a fost contestată la bancă (chargeback). Accesul Pro a fost suspendat până la rezolvarea contestației.',
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
      if (!subscriptionId) break;

      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      await prisma.subscription.update({
        where: { stripeSubscriptionId: subscriptionId },
        data: { currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000) },
      });
      break;
    }
  }

  return { received: true };
}

// ─────────────────────────────────────────────
// JOB ZILNIC — notificare abonament pe cale să expire
// Notificăm doar abonamentele care NU se vor reînnoi (cancel_at_period_end la Stripe),
// ca să evităm avertismente false pentru cele cu reînnoire automată.
// ─────────────────────────────────────────────

export async function notifyExpiringSubscriptions(): Promise<void> {
  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const subs = await prisma.subscription.findMany({
    where: {
      cancelledAt: null,
      stripeSubscriptionId: { not: null },
      currentPeriodEnd: { gte: now, lte: in3Days },
    },
    select: { id: true, userId: true, currentPeriodEnd: true, stripeSubscriptionId: true },
  });

  for (const sub of subs) {
    // Verificăm la Stripe dacă abonamentul se anulează la finalul perioadei
    let willCancel = false;
    try {
      const s = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId!);
      willCancel = s.cancel_at_period_end === true || s.status === 'canceled';
    } catch {
      continue; // nu putem verifica → nu trimitem (evită fals-pozitive)
    }
    if (!willCancel) continue; // se reînnoiește automat — nu e „expirare"

    // Dedup — o singură notificare per user în ultimele 7 zile
    const recent = await prisma.notification.findFirst({
      where: {
        userId: sub.userId,
        type: NotificationType.SUBSCRIPTION_EXPIRING,
        createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true },
    });
    if (recent) continue;

    const days = Math.max(1, Math.ceil((sub.currentPeriodEnd!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    createNotification({
      userId: sub.userId,
      type: NotificationType.SUBSCRIPTION_EXPIRING,
      title: 'Abonamentul Pro expiră curând',
      body: `Abonamentul tău Pro se încheie în ${days} ${days === 1 ? 'zi' : 'zile'} și nu se va reînnoi. Reactivează-l pentru a păstra beneficiile.`,
      data: { subscriptionId: sub.id },
    }).catch(() => {});
  }
}
