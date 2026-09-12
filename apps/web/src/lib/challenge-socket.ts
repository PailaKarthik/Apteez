'use client';

import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(
  /\/api\/v\d+$/,
  '',
);

let socket: Socket | null = null;

/**
 * Lazily creates the singleton Socket.IO connection to the challenge
 * namespace. Auth rides on the HTTP-only session cookie (withCredentials), so
 * no token is ever read from or written to client storage.
 */
export function getChallengeSocket(): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/challenge`, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socket;
}

export function disconnectChallengeSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
