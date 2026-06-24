import {
  Plan,
  IdeaCategory,
  IdeaVisibility,
  IdeaStatus,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// ─────────────────────────────────────────────
// CREARE IDEE
// ─────────────────────────────────────────────

interface CreateIdeaInput {
  userId: string;
  userPlan: Plan;
  title: string;
  category: IdeaCategory;
  problem: string;
  solution: string;
  targetAudience?: string;
  tags?: string[];
  visibility?: IdeaVisibility;
}

export async function createIdea(input: CreateIdeaInput) {
  const { userId, userPlan } = input;

  // Plan Gratuit: max 1 idee
  if (userPlan === Plan.GRATUIT) {
    const count = await prisma.idea.count({ where: { userId, user: { isDeleted: false } } });
    if (count >= 1) {
      throw Object.assign(new Error('Plan Gratuit permite doar 1 idee. Upgradează la Pro pentru idei nelimitate.'), { status: 403 });
    }
  }

  const wordCount = [input.problem, input.solution, input.targetAudience ?? '']
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return prisma.idea.create({
    data: {
      userId,
      title: input.title,
      category: input.category,
      problem: input.problem,
      solution: input.solution,
      targetAudience: input.targetAudience ?? null,
      tags: input.tags ?? [],
      visibility: input.visibility ?? IdeaVisibility.PUBLIC,
      status: IdeaStatus.PUBLICAT,
      planAtPost: userPlan,
      wordCount,
    },
    select: { id: true },
  });
}

// ─────────────────────────────────────────────
// ADĂUGARE IMAGINI
// ─────────────────────────────────────────────

interface AddIdeaImagesInput {
  ideaId: string;
  userId: string;
  images: { url: string; publicId: string }[];
}

export async function addIdeaImages({ ideaId, userId, images }: AddIdeaImagesInput) {
  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { userId: true, planAtPost: true } });
  if (!idea || idea.userId !== userId) throw Object.assign(new Error('Nu ai drept să modifici această idee.'), { status: 403 });

  const existing = await prisma.ideaImage.count({ where: { ideaId } });
  const maxImages = idea.planAtPost === Plan.PRO ? 10 : 3;
  if (existing + images.length > maxImages) {
    throw Object.assign(new Error(`Poți adăuga maxim ${maxImages} imagini (plan ${idea.planAtPost}).`), { status: 403 });
  }

  await prisma.ideaImage.createMany({
    data: images.map((img, i) => ({
      ideaId,
      url: img.url,
      publicId: img.publicId,
      order: existing + i,
    })),
  });
}

// ─────────────────────────────────────────────
// ADĂUGARE PDF
// ─────────────────────────────────────────────

interface AddIdeaPdfInput {
  ideaId: string;
  userId: string;
  url: string;
  publicId: string;
  filename: string;
  size: number;
}

export async function addIdeaPdf(input: AddIdeaPdfInput) {
  const idea = await prisma.idea.findUnique({ where: { id: input.ideaId }, select: { userId: true } });
  if (!idea || idea.userId !== input.userId) throw Object.assign(new Error('Nu ai drept să modifici această idee.'), { status: 403 });

  const existing = await prisma.ideaPdf.count({ where: { ideaId: input.ideaId } });
  if (existing >= 1) {
    throw Object.assign(new Error('Poți atașa un singur PDF per idee.'), { status: 403 });
  }

  await prisma.ideaPdf.create({
    data: {
      ideaId: input.ideaId,
      url: input.url,
      publicId: input.publicId,
      filename: input.filename,
      size: input.size,
    },
  });
}

// ─────────────────────────────────────────────
// VIZUALIZARE IDEE
// ─────────────────────────────────────────────

export async function getIdeaById(ideaId: string, viewerId: string) {
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: {
      id: true, title: true, category: true, problem: true, solution: true,
      targetAudience: true, tags: true, visibility: true, status: true,
      planAtPost: true, viewCount: true, wordCount: true, createdAt: true, updatedAt: true,
      userId: true,
      user: {
        select: {
          id: true, plan: true,
          profileElev: {
            select: {
              firstName: true, lastName: true, avatarUrl: true, city: true, school: true, class: true,
            },
          },
        },
      },
      images: { orderBy: { order: 'asc' }, select: { id: true, url: true, order: true } },
      pdfs: { select: { id: true, url: true, filename: true, size: true } },
      _count: { select: { feedbackList: true, connectionRequests: true } },
      feedbackList: {
        where: { antreprenorId: viewerId },
        select: {
          id: true, ratingGeneral: true, ratingOriginalitate: true,
          ratingViabilitate: true, ratingPrezentare: true, ratingPotential: true,
          comment: true, interestedInCollab: true, createdAt: true,
        },
        take: 1,
      },
    },
  });

  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });

  // Idee privată — vizibil doar elevului
  if (idea.visibility === IdeaVisibility.PRIVAT && idea.userId !== viewerId) {
    throw Object.assign(new Error('Această idee este privată.'), { status: 403 });
  }

  // Incrementăm view_count dacă nu e proprietarul
  if (idea.userId !== viewerId) {
    void prisma.idea.update({
      where: { id: ideaId },
      data: { viewCount: { increment: 1 } },
    });
  }

  // Cerere de conectare existentă de la viewer
  const connectionRequest = await prisma.connectionRequest.findFirst({
    where: { fromUserId: viewerId, ideaId },
    select: { id: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  return { ...idea, connectionRequest };
}

// ─────────────────────────────────────────────
// ACTUALIZARE IDEE
// ─────────────────────────────────────────────

interface UpdateIdeaInput {
  ideaId: string;
  userId: string;
  title?: string;
  category?: IdeaCategory;
  problem?: string;
  solution?: string;
  targetAudience?: string;
  tags?: string[];
  visibility?: IdeaVisibility;
  status?: IdeaStatus;
}

export async function updateIdea(input: UpdateIdeaInput) {
  const idea = await prisma.idea.findUnique({
    where: { id: input.ideaId },
    select: { userId: true },
  });
  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });
  if (idea.userId !== input.userId) throw Object.assign(new Error('Nu ai drept să modifici această idee.'), { status: 403 });

  const updateData: Prisma.IdeaUpdateInput = {};
  if (input.title !== undefined) updateData.title = input.title;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.problem !== undefined) updateData.problem = input.problem;
  if (input.solution !== undefined) updateData.solution = input.solution;
  if (input.targetAudience !== undefined) updateData.targetAudience = input.targetAudience;
  if (input.tags !== undefined) updateData.tags = input.tags;
  if (input.visibility !== undefined) updateData.visibility = input.visibility;
  if (input.status !== undefined) updateData.status = input.status;

  // Recalculăm wordCount dacă s-a schimbat textul
  if (input.problem || input.solution) {
    const existing = await prisma.idea.findUnique({
      where: { id: input.ideaId },
      select: { problem: true, solution: true, targetAudience: true },
    });
    if (existing) {
      const wordCount = [
        input.problem ?? existing.problem,
        input.solution ?? existing.solution,
        input.targetAudience ?? existing.targetAudience ?? '',
      ].join(' ').trim().split(/\s+/).filter(Boolean).length;
      updateData.wordCount = wordCount;
    }
  }

  return prisma.idea.update({
    where: { id: input.ideaId },
    data: updateData,
    select: { id: true, status: true, visibility: true, updatedAt: true },
  });
}

// ─────────────────────────────────────────────
// ȘTERGERE IDEE
// ─────────────────────────────────────────────

export async function deleteIdea(ideaId: string, userId: string) {
  const idea = await prisma.idea.findUnique({ where: { id: ideaId }, select: { userId: true } });
  if (!idea) throw Object.assign(new Error('Idee negăsită.'), { status: 404 });
  if (idea.userId !== userId) throw Object.assign(new Error('Nu ai drept să ștergi această idee.'), { status: 403 });

  // Ștergem fizic (Cascadă în schema Prisma va șterge imagini, PDF-uri, etc.)
  await prisma.idea.delete({ where: { id: ideaId } });
}

// ─────────────────────────────────────────────
// IDEI ELEV (profilul propriu)
// ─────────────────────────────────────────────

export async function getMyIdeas(userId: string) {
  return prisma.idea.findMany({
    where: { userId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, title: true, category: true, status: true, visibility: true,
      planAtPost: true, viewCount: true, createdAt: true,
      images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
      _count: { select: { feedbackList: true, connectionRequests: true } },
    },
  });
}
