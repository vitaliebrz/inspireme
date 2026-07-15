import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import type { JwtPayload } from '../types/index.js';

export function registerSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) {
      // Conexiune anonimă — permisă doar pentru support public
      socket.data['user'] = null;
      return next();
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data['user'] = payload;
      next();
    } catch {
      next(new Error('Token invalid'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data['user'] as JwtPayload | null;

    if (user) {
      console.log(`[Socket] User conectat: ${user.sub}`);

      // Room personal — notificări push
      socket.join(`user:${user.sub}`);

      // Anunță abonații că userul este online
      socket.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'online' });

      // ─────── Conversații ───────

      // Autorizare: intri în camera conversației doar dacă ești participant.
      // Fără verificare, oricine cu un conversationId ar putea asculta mesaje private.
      socket.on('join:conversation', async (conversationId: string) => {
        if (typeof conversationId !== 'string') return;
        const conv = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { participantAId: true, participantBId: true },
        });
        if (!conv || (conv.participantAId !== user.sub && conv.participantBId !== user.sub)) return;
        socket.join(`conversation:${conversationId}`);
      });

      socket.on('leave:conversation', (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
      });

      // ─────── Grupuri ───────

      // Autorizare: intri în camera grupului doar dacă ești membru.
      socket.on('join:group', async (groupId: string) => {
        if (typeof groupId !== 'string') return;
        const member = await prisma.ideaGroupMember.findUnique({
          where: { groupId_userId: { groupId, userId: user.sub } },
          select: { userId: true },
        });
        if (!member) return;
        socket.join(`group:${groupId}`);
      });

      socket.on('leave:group', (groupId: string) => {
        socket.leave(`group:${groupId}`);
      });

      // ─────── Typing ───────

      socket.on('typing:start', (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit('typing:start', { userId: user.sub });
      });

      socket.on('typing:stop', (conversationId: string) => {
        socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId: user.sub });
      });

      // ─────── Prezență ───────

      socket.on('presence:subscribe', (targetUserId: string) => {
        socket.join(`presence:${targetUserId}`);
        const room = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
        const status = room && room.size > 0 ? 'online' : 'offline';
        socket.emit('user:status', { userId: targetUserId, status });
      });

      socket.on('presence:unsubscribe', (targetUserId: string) => {
        socket.leave(`presence:${targetUserId}`);
      });

      socket.on('presence:away', () => {
        socket.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'offline' });
      });

      socket.on('presence:active', () => {
        socket.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'online' });
      });

      socket.on('disconnect', () => {
        console.log(`[Socket] User deconectat: ${user.sub}`);
        setTimeout(() => {
          const room = io.sockets.adapter.rooms.get(`user:${user.sub}`);
          if (!room || room.size === 0) {
            io.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'offline' });
          }
        }, 3000);
      });
    }

    // ─────── Support chat (auth + anonim) ───────

    // Autorizare: nu lăsăm orice socket să asculte orice tichet.
    //  - Admin: poate intra în orice tichet (moderează suportul).
    //  - Utilizator autentificat: doar propriul tichet (ticket.userId === sub).
    //  - Socket anonim: doar tichete anonime (fără userId) — nu tichetele
    //    utilizatorilor înregistrați, care conțin nume/avatar (PII).
    socket.on('support:join', async (ticketId: string) => {
      if (typeof ticketId !== 'string') return;
      const ticket = await prisma.supportTicket.findUnique({
        where: { id: ticketId },
        select: { userId: true },
      });
      if (!ticket) return;

      if (user) {
        const isOwner = ticket.userId === user.sub;
        const isAdmin = user.role === 'ADMIN';
        if (!isOwner && !isAdmin) return;
      } else if (ticket.userId !== null) {
        // Socket anonim nu poate intra în tichetul unui utilizator autentificat
        return;
      }

      socket.join(`support:${ticketId}`);
    });

    socket.on('support:leave', (ticketId: string) => {
      socket.leave(`support:${ticketId}`);
    });
  });
}
