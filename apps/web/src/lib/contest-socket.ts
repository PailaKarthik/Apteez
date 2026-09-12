'use client';

import { io, type Socket } from 'socket.io-client';
import type { ContestSocketEvent } from '@apteez/types';
import { CONTEST_SOCKET_EVENTS } from '@apteez/types';
import { apiBrowserUrl } from '@/lib/api-client';

/**
 * Contest realtime channel. Answers travel exclusively over REST — the socket
 * only carries authoritative state changes (start/end/status) so a suspended
 * tab resynchronizes without polling. One shared socket per browser page.
 */
let socket: Socket | null = null;

export function getContestSocket(): Socket | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (!socket) {
    socket = io(apiBrowserUrl('').replace(/\/api\/v1\/?$/, ''), {
      transports: ['websocket'],
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export interface ContestSyncHandlers {
  onState: (payload: { contestId: string; status: string; serverTime: string }) => void;
}

export function connectContestSync(contestId: string, handlers: ContestSyncHandlers): () => void {
  const channel = getContestSocket();
  if (!channel) {
    return () => undefined;
  }

  const onState = (payload: { contestId: string; status: string; serverTime: string }): void => {
    if (payload?.contestId === contestId) {
      handlers.onState(payload);
    }
  };
  const onError = (payload: { message?: string }): void => {
    // State sync is best-effort; failures are non-fatal by design.
    console.warn('contest sync error', payload);
  };

  channel.on(CONTEST_SOCKET_EVENTS.state as ContestSocketEvent, onState);
  channel.on(CONTEST_SOCKET_EVENTS.error as ContestSocketEvent, onError);
  channel.emit(CONTEST_SOCKET_EVENTS.subscribe, { contestId });
  channel.connect();

  return () => {
    channel.off(CONTEST_SOCKET_EVENTS.state as ContestSocketEvent, onState);
    channel.off(CONTEST_SOCKET_EVENTS.error as ContestSocketEvent, onError);
    channel.emit(CONTEST_SOCKET_EVENTS.subscribe, { contestId: null });
  };
}
