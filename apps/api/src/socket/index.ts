import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt.js';

export function registerSocketHandlers(io: Server): void {
  io.use((socket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined;
    if (!token) return next(new Error('Autentificare necesară'));

    try {
      const payload = verifyAccessToken(token);
      socket.data['user'] = payload;
      next();
    } catch {
      next(new Error('Token invalid'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data['user'];
    console.log(`[Socket] User conectat: ${user.sub}`);

    // Room personal — notificări push
    socket.join(`user:${user.sub}`);

    // Anunță abonații că userul este online
    socket.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'online' });

    // ─────── Conversații ───────

    socket.on('join:conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('message:send', (data: { conversationId: string; message: Record<string, unknown> }) => {
      socket.to(`conversation:${data.conversationId}`).emit('message:new', data);
    });

    // ─────── Grupuri ───────

    socket.on('join:group', (groupId: string) => {
      socket.join(`group:${groupId}`);
    });

    socket.on('leave:group', (groupId: string) => {
      socket.leave(`group:${groupId}`);
    });

    socket.on('group:message:send', (data: { groupId: string; message: Record<string, unknown> }) => {
      socket.to(`group:${data.groupId}`).emit('group:message:new', data);
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
      // Verificăm dacă userul țintă are vreun socket activ
      const room = io.sockets.adapter.rooms.get(`user:${targetUserId}`);
      const status = room && room.size > 0 ? 'online' : 'offline';
      socket.emit('user:status', { userId: targetUserId, status });
    });

    socket.on('presence:unsubscribe', (targetUserId: string) => {
      socket.leave(`presence:${targetUserId}`);
    });

    // Tab ascuns sau focus pierdut pe fereastra browserului
    socket.on('presence:away', () => {
      socket.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'offline' });
    });

    // Tab vizibil sau focus revenit
    socket.on('presence:active', () => {
      socket.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'online' });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User deconectat: ${user.sub}`);
      // Delay 3s: evităm flash "offline" la refresh rapid sau reconectare automată
      setTimeout(() => {
        const room = io.sockets.adapter.rooms.get(`user:${user.sub}`);
        if (!room || room.size === 0) {
          io.to(`presence:${user.sub}`).emit('user:status', { userId: user.sub, status: 'offline' });
        }
      }, 3000);
    });
  });
}
