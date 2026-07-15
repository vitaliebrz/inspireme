import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// ─────────────────────────────────────────────
// PROFIL PROPRIU — date complete
// ─────────────────────────────────────────────

export async function getMyProfile(userId: string, role: Role) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, role: true, plan: true, createdAt: true,
      profileElev: role === Role.ELEV ? {
        select: {
          firstName: true, lastName: true, username: true, school: true, class: true,
          city: true, bio: true, interests: true, avatarUrl: true,
        },
      } : false,
      profileAntreprenor: role === Role.ANTREPRENOR ? {
        select: {
          firstName: true, lastName: true, username: true, company: true, position: true,
          domain: true, website: true, bioMentor: true, experienceYears: true,
          avatarUrl: true, status: true,
        },
      } : false,
      _count: {
        select: {
          ideas: true,
          collaborationsAsElev: true,
          collaborationsAsAntreprenor: true,
          giveawaysCreated: true,
          feedbackGiven: true,
        },
      },
    },
  });
  if (!user) throw Object.assign(new Error('Utilizator negăsit.'), { status: 404 });
  return { ...user, targetRole: role as string };
}

// ─────────────────────────────────────────────
// ACTUALIZARE PROFIL ELEV
// ─────────────────────────────────────────────

export interface UpdateElevProfileInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  username?: string | null;
  school?: string;
  class?: string;
  city?: string;
  bio?: string;
  interests?: string[];
  avatarUrl?: string;
}

export async function updateElevProfile(input: UpdateElevProfileInput) {
  const { userId, ...data } = input;
  // Dacă username este string gol, îl tratăm ca null (ștergere username)
  if (data.username !== undefined) {
    data.username = data.username === '' ? null : data.username;
  }
  return prisma.profileElev.upsert({
    where: { userId },
    create: {
      userId,
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      ...data,
    },
    update: data,
    select: {
      firstName: true, lastName: true, username: true, school: true, class: true,
      city: true, bio: true, interests: true, avatarUrl: true,
    },
  });
}

// ─────────────────────────────────────────────
// ACTUALIZARE PROFIL ANTREPRENOR
// ─────────────────────────────────────────────

export interface UpdateAntreprenorProfileInput {
  userId: string;
  firstName?: string;
  lastName?: string;
  username?: string | null;
  company?: string;
  position?: string;
  domain?: string;
  website?: string;
  bioMentor?: string;
  experienceYears?: number;
  avatarUrl?: string;
}

export async function updateAntreprenorProfile(input: UpdateAntreprenorProfileInput) {
  const { userId, ...data } = input;
  // Dacă username este string gol, îl tratăm ca null (ștergere username)
  if (data.username !== undefined) {
    data.username = data.username === '' ? null : data.username;
  }
  return prisma.profileAntreprenor.upsert({
    where: { userId },
    create: {
      userId,
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      ...data,
    },
    update: data,
    select: {
      firstName: true, lastName: true, username: true, company: true, position: true,
      domain: true, website: true, bioMentor: true, experienceYears: true,
      avatarUrl: true, status: true,
    },
  });
}

// ─────────────────────────────────────────────
// PROFIL PUBLIC ELEV
// ─────────────────────────────────────────────

export async function getPublicElevProfile(userId: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, plan: true, createdAt: true,
      profileElev: {
        select: {
          firstName: true, lastName: true, username: true, school: true, class: true,
          city: true, bio: true, interests: true, avatarUrl: true,
        },
      },
      ideas: {
        where: { visibility: 'PUBLIC' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, categories: true, status: true, planAtPost: true,
          viewCount: true, createdAt: true,
          images: { select: { url: true }, take: 1 },
          _count: { select: { feedbackList: true } },
        },
      },
      collaborationsAsElev: {
        where: { confirmedAt: { not: null } },
        select: {
          confirmedAt: true,
          antreprenor: {
            select: {
              profileAntreprenor: { select: { firstName: true, lastName: true, company: true, avatarUrl: true } },
            },
          },
        },
      },
      giveawayParticipations: {
        orderBy: { joinedAt: 'desc' },
        take: 30,
        select: {
          joinedAt: true,
          giveaway: { select: { id: true, title: true, status: true, winnerId: true } },
        },
      },
      _count: { select: { ideas: true, collaborationsAsElev: true } },
    },
  });
  if (!user) throw Object.assign(new Error('Profil negăsit.'), { status: 404 });

  // Profilul propriu: returnăm și datele private (participări giveaway, feedback primit)
  if (userId === viewerId) {
    const feedbackReceived = await prisma.feedback.findMany({
      where: { idea: { userId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, ratingGeneral: true, comment: true, createdAt: true,
        antreprenor: {
          select: {
            profileAntreprenor: { select: { firstName: true, lastName: true, avatarUrl: true } },
          },
        },
        idea: { select: { title: true } },
      },
    });
    return {
      ...user,
      giveawayParticipations: user.giveawayParticipations.map((p) => ({
        id: p.giveaway.id,
        title: p.giveaway.title,
        status: p.giveaway.status as string,
        isWinner: p.giveaway.winnerId === userId,
        joinedAt: p.joinedAt.toISOString(),
      })),
      feedbackReceived,
    };
  }

  // Verificăm dacă viewerul a blocat sau a fost blocat
  const blocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: userId },
        { blockerId: userId, blockedId: viewerId },
      ],
    },
  });
  if (blocked) throw Object.assign(new Error('Nu poți vizualiza acest profil.'), { status: 403 });

  return user;
}

// ─────────────────────────────────────────────
// PROFIL PUBLIC ANTREPRENOR
// ─────────────────────────────────────────────

export async function getPublicAntreprenorProfile(userId: string, viewerId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, plan: true, createdAt: true,
      profileAntreprenor: {
        select: {
          firstName: true, lastName: true, username: true, company: true, position: true,
          domain: true, website: true, bioMentor: true, experienceYears: true,
          avatarUrl: true, status: true,
        },
      },
      collaborationsAsAntreprenor: {
        where: { confirmedAt: { not: null } },
        take: 6,
        select: {
          confirmedAt: true,
          idea: { select: { id: true, title: true, categories: true } },
          elev: {
            select: {
              profileElev: { select: { firstName: true, lastName: true, avatarUrl: true } },
            },
          },
        },
      },
      giveawaysCreated: {
        orderBy: { startDate: 'desc' },
        take: 5,
        select: {
          id: true, title: true, status: true,
          _count: { select: { participants: true } },
        },
      },
      investmentHistory: {
        where: { status: { not: 'NECONFIRMAT' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, investmentType: true, amountDescription: true, status: true, createdAt: true,
          idea: { select: { id: true, title: true } },
        },
      },
      _count: {
        select: {
          collaborationsAsAntreprenor: true,
          giveawaysCreated: true,
          feedbackGiven: true,
        },
      },
    },
  });
  if (!user) throw Object.assign(new Error('Profil negăsit.'), { status: 404 });

  if (userId === viewerId) return user;

  const blocked = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: viewerId, blockedId: userId },
        { blockerId: userId, blockedId: viewerId },
      ],
    },
  });
  if (blocked) throw Object.assign(new Error('Nu poți vizualiza acest profil.'), { status: 403 });

  return user;
}
