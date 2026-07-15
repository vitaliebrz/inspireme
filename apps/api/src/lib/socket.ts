import { Server } from 'socket.io';

// Singleton — setat la bootstrap din index.ts, folosit de servicii
// pentru a emite evenimente fără a trece instanța io prin fiecare funcție.
let io: Server | null = null;

export function setIO(instance: Server): void {
  io = instance;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown): void {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function emitToGroup(groupId: string, event: string, payload: unknown): void {
  io?.to(`group:${groupId}`).emit(event, payload);
}

export function emitToSupportRoom(ticketId: string, payload: unknown): void {
  io?.to(`support:${ticketId}`).emit('support:message:new', payload);
}

// Scoate forțat toate socket-urile unui utilizator dintr-o cameră (ex: la eliminarea
// dintr-un grup). Fiecare user e în camera personală `user:<id>`, așa că țintim acolo.
export function removeUserFromRoom(userId: string, room: string): void {
  io?.in(`user:${userId}`).socketsLeave(room);
}
