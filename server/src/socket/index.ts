import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { env } from '../config/env';
import { verifyAccessToken } from '../utils/tokens';

/**
 * Room design:
 *  - `user:<id>`  every socket of a user joins its personal room, so a notification
 *                 reaches all their open tabs/devices with one emit.
 *  - `role:<role>` lets us broadcast to e.g. all managers without looping users.
 * Sockets authenticate with the same short-lived access token as the REST API.
 */
let io: Server | null = null;

export function initSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: { origin: env.clientOrigins, credentials: true },
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string } | undefined)?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    void socket.join(`user:${String(socket.data.userId)}`);
    void socket.join(`role:${String(socket.data.role)}`);
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToAll(event: string, payload: unknown): void {
  io?.emit(event, payload);
}
