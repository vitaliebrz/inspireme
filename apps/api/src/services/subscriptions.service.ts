import Stripe from 'stripe';
import { Plan, Role, NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sendPaymentFailedEmail, createNotification } from './notifications.service.js';

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

    case 'customer.subscription.deleted': {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const sub = await prisma.subscription.findUnique({
        where: { stripeSubscriptionId: stripeSubscription.id },
        select: { userId: true },
      });
      if (sub) {
        await prisma.$transaction([
          prisma.subscription.update({
            where: { stripeSubscriptionId: stripeSubscription.id },
            data: { cancelledAt: new Date() },
          }),
          prisma.user.update({
            where: { id: sub.userId },
            data: { plan: Plan.GRATUIT },
          }),
        ]);
      }
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
