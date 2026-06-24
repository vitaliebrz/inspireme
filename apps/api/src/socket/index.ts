import { Server } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt.js';

export function registerSocketHandlers(io: Server): void {
  // Autentificare Socket.io prin JWT
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

    // Alăturare la room-urile proprii (conversații)
    socket.on('join:conversation', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('leave:conversation', (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Trimitere mesaj — validat și salvat în DB din ruta REST
    // Socket.io doar emite mesajul celorlalți participanți
    socket.on('message:send', (data: { conversationId: string; messageId: string }) => {
      socket.to(`conversation:${data.conversationId}`).emit('message:new', data);
    });

    // Typing indicator
    socket.on('typing:start', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:start', { userId: user.sub });
    });

    socket.on('typing:stop', (conversationId: string) => {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', { userId: user.sub });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] User deconectat: ${user.sub}`);
    });
  });
}
