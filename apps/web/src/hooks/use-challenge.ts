'use client';

import { useQuery } from '@tanstack/react-query';
import * as React from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ChallengeAnswerAckDto,
  ChallengeHistoryEntryDto,
  ChallengeResultDto,
  ChallengeStateDto,
  CursorPage,
} from '@apteez/types';
import { CHALLENGE_SOCKET_EVENTS } from '@apteez/types';
import { apiFetch } from '@/lib/api-client';
import { getChallengeSocket } from '@/lib/challenge-socket';

export type ChallengePhase =
  'idle' | 'searching' | 'countdown' | 'live' | 'completed' | 'cancelled' | 'error';

export interface ChallengeSocketError {
  code: string;
  message: string;
}

interface ChallengeLiveState {
  phase: ChallengePhase;
  connected: boolean;
  state: ChallengeStateDto | null;
  error: ChallengeSocketError | null;
}

export interface UseChallengeResult extends ChallengeLiveState {
  connect: () => void;
  startMatchmaking: (domainSlug: string) => void;
  cancelMatchmaking: () => void;
  subscribe: (challengeId: string) => void;
  submitAnswer: (input: {
    challengeId: string;
    position: number;
    selectedOptionId: string;
    clientElapsedMs?: number;
  }) => void;
  leave: () => void;
  reset: () => void;
}

/**
 * Live challenge session state. The socket is the source of truth for live
 * phases; the server pushes authoritative `challenge:state` snapshots and the
 * client only ever mirrors them. No competitive value is computed here.
 */
export function useChallenge(): UseChallengeResult {
  const socketRef = React.useRef<Socket | null>(null);
  const [live, setLive] = React.useState<ChallengeLiveState>({
    phase: 'idle',
    connected: false,
    state: null,
    error: null,
  });

  const connect = React.useCallback((): void => {
    const socket = getChallengeSocket();
    socketRef.current = socket;
    if (socket.connected) {
      setLive((prev) => ({ ...prev, connected: true }));
      return;
    }
    socket.connect();
  }, []);

  React.useEffect(() => {
    const socket = getChallengeSocket();
    socketRef.current = socket;

    const onConnect = (): void => setLive((prev) => ({ ...prev, connected: true }));
    const onDisconnect = (): void => setLive((prev) => ({ ...prev, connected: false }));
    const onState = (state: ChallengeStateDto): void => {
      setLive((prev) => ({
        ...prev,
        state,
        error: null,
        phase: phaseFromStatus(state.status, prev.phase),
      }));
    };
    const onStatus = (payload: { status: string }): void => {
      if (payload.status === 'SEARCHING') {
        setLive((prev) => ({ ...prev, phase: 'searching', error: null }));
      } else if (payload.status === 'CANCELLED') {
        setLive((prev) => ({ ...prev, phase: 'cancelled', state: null }));
      }
    };
    const onCompleted = (): void => setLive((prev) => ({ ...prev, phase: 'completed' }));
    const onError = (error: ChallengeSocketError): void => setLive((prev) => ({ ...prev, error }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(CHALLENGE_SOCKET_EVENTS.state, onState);
    socket.on(CHALLENGE_SOCKET_EVENTS.matchmakingStatus, onStatus);
    socket.on(CHALLENGE_SOCKET_EVENTS.completed, onCompleted);
    socket.on(CHALLENGE_SOCKET_EVENTS.error, onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(CHALLENGE_SOCKET_EVENTS.state, onState);
      socket.off(CHALLENGE_SOCKET_EVENTS.matchmakingStatus, onStatus);
      socket.off(CHALLENGE_SOCKET_EVENTS.completed, onCompleted);
      socket.off(CHALLENGE_SOCKET_EVENTS.error, onError);
    };
  }, []);

  const startMatchmaking = React.useCallback(
    (domainSlug: string): void => {
      connect();
      setLive((prev) => ({ ...prev, phase: 'searching', error: null, state: null }));
      socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.startMatchmaking, { domainSlug });
    },
    [connect],
  );

  const cancelMatchmaking = React.useCallback((): void => {
    socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.cancelMatchmaking);
    setLive((prev) => ({ ...prev, phase: 'idle', state: null, error: null }));
  }, []);

  const subscribe = React.useCallback(
    (challengeId: string): void => {
      connect();
      socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.subscribe, { challengeId });
    },
    [connect],
  );

  const submitAnswer = React.useCallback(
    (input: {
      challengeId: string;
      position: number;
      selectedOptionId: string;
      clientElapsedMs?: number;
    }): void => {
      const socket = socketRef.current;
      if (!socket) {
        return;
      }
      socket.emit(CHALLENGE_SOCKET_EVENTS.answer, input, (ack: ChallengeAnswerAckDto) => {
        setLive((prev) => {
          if (!prev.state || !ack.nextQuestion) {
            return prev;
          }
          return { ...prev, state: { ...prev.state, question: ack.nextQuestion } };
        });
      });
    },
    [],
  );

  const leave = React.useCallback((): void => {
    socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.leave);
    setLive({ phase: 'idle', connected: false, state: null, error: null });
  }, []);

  const reset = React.useCallback((): void => {
    setLive((prev) => ({ ...prev, phase: 'idle', state: null, error: null }));
  }, []);

  return {
    ...live,
    connect,
    startMatchmaking,
    cancelMatchmaking,
    subscribe,
    submitAnswer,
    leave,
    reset,
  };
}

function phaseFromStatus(
  status: ChallengeStateDto['status'],
  current: ChallengePhase,
): ChallengePhase {
  switch (status) {
    case 'COUNTDOWN':
    case 'MATCHED':
      return 'countdown';
    case 'LIVE':
      return 'live';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    case 'ABANDONED':
    case 'EXPIRED':
      return 'completed';
    default:
      return current === 'idle' ? 'searching' : current;
  }
}

export interface ChallengeDomain {
  slug: string;
  name: string;
  icon: string | null;
  problemCount: number;
}

export function useChallengeDomains() {
  return useQuery({
    queryKey: ['challenge', 'domains'],
    queryFn: () => apiFetch<ChallengeDomain[]>('/challenges/domains'),
    staleTime: 5 * 60_000,
  });
}

export function useChallengeHistory(limit = 20) {
  return useQuery({
    queryKey: ['challenge', 'history', limit],
    queryFn: () =>
      apiFetch<CursorPage<ChallengeHistoryEntryDto>>(`/challenges/history?limit=${limit}`),
    staleTime: 15_000,
  });
}

export function useChallengeResult(challengeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['challenge', 'result', challengeId],
    queryFn: () => apiFetch<ChallengeResultDto>(`/challenges/${challengeId}/result`),
    enabled: Boolean(challengeId) && enabled,
    staleTime: 30_000,
  });
}
