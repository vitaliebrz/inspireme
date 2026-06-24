import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { redis, REDIS_KEYS, REDIS_TTL } from '../lib/redis.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt.js';
import { sendPasswordResetEmail, sendParentalConsentEmail } from '../lib/email.js';
import { AppError } from '../middleware/errorHandler.js';
import { Role, Plan } from '../types/index.js';

const SALT_ROUNDS = 12;
const FRONTEND_URL = process.env['FRONTEND_URL'] ?? 'http://localhost:5173';

// ─── Tipuri interne ───────────────────────────────────────────────

interface RegisterElevInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  isUnder16: boolean;
  parentEmail?: string;
  school?: string;
  class?: string;
  city?: string;
  bio?: string;
  interests?: string[];
}

interface RegisterAntreprenorInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  company?: string;
  position?: string;
  domain: string;
  website?: string;
  bioMentor?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface AuthResult extends TokenPair {
  user: PublicUser;
}

interface PublicUser {
  id: string;
  email: string;
  role: Role;
  plan: Plan;
  firstLogin: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────

function toPublicUser(user: { id: string; email: string; role: Role; plan: Plan; firstLogin: boolean }): PublicUser {
  return { id: user.id, email: user.email, role: user.role, plan: user.plan, firstLogin: user.firstLogin };
}

async function generateTokenPair(user: PublicUser): Promise<TokenPair> {
  const payload = { sub: user.id, email: user.email, role: user.role, plan: user.plan };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Stochează refresh token hashed în Redis (rotație la fiecare refresh)
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  await redis.set(REDIS_KEYS.refreshToken(user.id), tokenHash, { ex: 60 * 60 * 24 * 7 });

  return { accessToken, refreshToken };
}

// ─── Register Elev ────────────────────────────────────────────────

export async function registerElev(input: RegisterElevInput): Promise<AuthResult | { pendingConsent: true }> {
  const emailLower = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existing) throw new AppError(409, 'Există deja un cont cu acest email.');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // Minori sub 16 ani — cont suspendat până la confirmare parentală
  const isSuspended = input.isUnder16;

  const user = await prisma.user.create({
    data: {
      email: emailLower,
      passwordHash,
      role: Role.ELEV,
      plan: Plan.GRATUIT,
      isSuspended,
      profileElev: {
        create: {
          firstName: input.firstName,
          lastName: input.lastName,
          school: input.school ?? null,
          class: input.class ?? null,
          city: input.city ?? null,
          bio: input.bio ?? null,
          interests: input.interests ?? [],
        },
      },
    },
  });

  if (input.isUnder16 && input.parentEmail) {
    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await prisma.parentalConsent.create({
      data: {
        userId: user.id,
        parentEmail: input.parentEmail,
        token,
        expiresAt,
      },
    });

    // Token în Redis pentru lookup rapid
    await redis.set(REDIS_KEYS.parentalConsent(token), user.id, { ex: REDIS_TTL.parentalConsent });

    const confirmLink = `${FRONTEND_URL}/parental-consent/${token}/confirm`;
    const rejectLink = `${FRONTEND_URL}/parental-consent/${token}/reject`;
    const childName = `${input.firstName} ${input.lastName}`;

    await sendParentalConsentEmail(input.parentEmail, childName, confirmLink, rejectLink);

    return { pendingConsent: true };
  }

  const publicUser = toPublicUser(user);
  const tokens = await generateTokenPair(publicUser);
  return { ...tokens, user: publicUser };
}

// ─── Register Antreprenor ─────────────────────────────────────────

export async function registerAntreprenor(input: RegisterAntreprenorInput): Promise<AuthResult> {
  const emailLower = input.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: emailLower } });
  if (existing) throw new AppError(409, 'Există deja un cont cu acest email.');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: emailLower,
      passwordHash,
      role: Role.ANTREPRENOR,
      plan: Plan.GRATUIT,
      profileAntreprenor: {
        create: {
          firstName: input.firstName,
          lastName: input.lastName,
          company: input.company ?? null,
          position: input.position ?? null,
          domain: input.domain,
          website: input.website ?? null,
          bioMentor: input.bioMentor ?? null,
        },
      },
    },
  });

  const publicUser = toPublicUser(user);
  const tokens = await generateTokenPair(publicUser);
  return { ...tokens, user: publicUser };
}

// ─── Login ────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<AuthResult> {
  const emailLower = email.toLowerCase();

  const user = await prisma.user.findUnique({ where: { email: emailLower } });

  // Nu dezvăluim dacă userul există sau nu (securitate)
  if (!user) {
    await bcrypt.hash(password, SALT_ROUNDS); // timing attack prevention
    throw new AppError(401, 'Email sau parolă incorectă.');
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) throw new AppError(401, 'Email sau parolă incorectă.');

  if (user.isDeleted) throw new AppError(403, 'Contul a fost șters.');

  if (user.isSuspended) {
    // Verifică dacă e în așteptarea consimțământului parental
    const consent = await prisma.parentalConsent.findUnique({ where: { userId: user.id } });
    if (consent && !consent.confirmedAt) {
      throw new AppError(403, 'Contul tău este în așteptarea confirmării părintelui. Verifică email-ul părintelui.');
    }
    throw new AppError(403, 'Contul tău este suspendat. Contactează echipa InspireMe.');
  }

  // Actualizează lastLogin și marchează firstLogin = false după primul token
  const isFirstLogin = user.firstLogin;
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLogin: new Date(), lastActivity: new Date() },
  });

  const publicUser = toPublicUser({ ...user, firstLogin: isFirstLogin });
  const tokens = await generateTokenPair(publicUser);

  // Marchează firstLogin = false (după ce am generat token-ul cu firstLogin: true)
  if (isFirstLogin) {
    await prisma.user.update({ where: { id: user.id }, data: { firstLogin: false } });
  }

  return { ...tokens, user: publicUser };
}

// ─── Refresh Token ────────────────────────────────────────────────

export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError(401, 'Refresh token invalid sau expirat.');
  }

  // Verifică că token-ul e cel din Redis (nu a fost revocat)
  const storedHash = await redis.get<string>(REDIS_KEYS.refreshToken(payload.sub));
  const incomingHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  if (!storedHash || storedHash !== incomingHash) {
    throw new AppError(401, 'Refresh token revocat. Autentifică-te din nou.');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.isDeleted || user.isSuspended) {
    throw new AppError(401, 'Cont indisponibil.');
  }

  const publicUser = toPublicUser(user);
  return generateTokenPair(publicUser);
}

// ─── Logout ───────────────────────────────────────────────────────

export async function logout(userId: string): Promise<void> {
  await redis.del(REDIS_KEYS.refreshToken(userId));
}

// ─── Forgot Password ──────────────────────────────────────────────

export async function forgotPassword(email: string): Promise<void> {
  const emailLower = email.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email: emailLower } });

  // Nu dezvăluim dacă userul există (securitate)
  if (!user || user.isDeleted) return;

  const token = crypto.randomUUID();
  const resetLink = `${FRONTEND_URL}/reset-password?token=${token}`;

  // Stochează în Redis — TTL 24 ore, single-use (șterse după folosire)
  await redis.set(REDIS_KEYS.passwordReset(token), user.id, { ex: REDIS_TTL.passwordReset });

  await sendPasswordResetEmail(user.email, resetLink);
}

// ─── Validate Reset Token ─────────────────────────────────────────

export async function validateResetToken(token: string): Promise<boolean> {
  const userId = await redis.get<string>(REDIS_KEYS.passwordReset(token));
  return !!userId;
}

// ─── Reset Password ───────────────────────────────────────────────

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const userId = await redis.get<string>(REDIS_KEYS.passwordReset(token));
  if (!userId) throw new AppError(400, 'Link-ul a expirat sau a fost deja utilizat.');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Single-use: șterge token din Redis
  await redis.del(REDIS_KEYS.passwordReset(token));

  // Revocă toate refresh token-urile active
  await redis.del(REDIS_KEYS.refreshToken(userId));
}

// ─── Parental Consent ─────────────────────────────────────────────

export async function confirmParentalConsent(token: string): Promise<void> {
  const consent = await prisma.parentalConsent.findUnique({ where: { token } });

  if (!consent) throw new AppError(404, 'Link de confirmare invalid.');
  if (consent.confirmedAt) throw new AppError(400, 'Consimțământul a fost deja confirmat.');
  if (consent.rejectedAt) throw new AppError(400, 'Accesul a fost deja refuzat.');
  if (new Date() > consent.expiresAt) throw new AppError(400, 'Link-ul a expirat. Rugați copilul să se înregistreze din nou.');

  await prisma.$transaction([
    prisma.parentalConsent.update({
      where: { token },
      data: { confirmedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: consent.userId },
      data: { isSuspended: false },
    }),
  ]);

  await redis.del(REDIS_KEYS.parentalConsent(token));
}

export async function rejectParentalConsent(token: string): Promise<void> {
  const consent = await prisma.parentalConsent.findUnique({ where: { token } });

  if (!consent) throw new AppError(404, 'Link de confirmare invalid.');
  if (consent.confirmedAt) throw new AppError(400, 'Consimțământul a fost deja confirmat.');

  // Ștergem userul — nicio dată sensibilă nu a fost creată încă
  await prisma.user.delete({ where: { id: consent.userId } });
  await redis.del(REDIS_KEYS.parentalConsent(token));
}
