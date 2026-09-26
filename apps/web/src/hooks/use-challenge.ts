'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as React from 'react';
import type { Socket } from 'socket.io-client';
import type {
  ChallengeAnswerAckDto,
  ChallengeHistoryEntryDto,
  ChallengeHistoryStatsDto,
  ChallengeMatchedPayload,
  ChallengeOpponentProgressDto,
  ChallengeResultDto,
  ChallengeStateDto,
  OffsetPage,
} from '@apteez/types';
import { CHALLENGE_SOCKET_EVENTS } from '@apteez/types';
import { apiFetch } from '@/lib/api-client';
import { getChallengeSocket } from '@/lib/challenge-socket';

export type ChallengePhase =
  'idle' | 'searching' | 'countdown' | 'live' | 'finalizing' | 'completed' | 'cancelled' | 'error';

export interface ChallengeSocketError {
  code: string;
  message: string;
}

interface ChallengeLiveState {
  phase: ChallengePhase;
  connected: boolean;
  state: ChallengeStateDto | null;
  /** Instant match-found payload; hydrated by the full state snapshot after. */
  matched: ChallengeMatchedPayload | null;
  /** True while an answer is in flight to the server. */
  answerPending: boolean;
  /** True when the in-flight answer exceeds the slow-server threshold. */
  answerSlow: boolean;
  answerError: string | null;
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

/** After this long without an ack, tell the user the server is slow (free-tier wake-ups). */
const SLOW_ANSWER_MS = 6000;

function isAck(value: unknown): value is ChallengeAnswerAckDto {
  return typeof value === 'object' && value !== null && 'accepted' in value;
}

/**
 * Live challenge session state. The socket is the source of truth for live
 * phases; the server pushes authoritative `challenge:state` snapshots and the
 * client only ever mirrors them. No competitive value is computed here.
 */
export function useChallenge(): UseChallengeResult {
  const socketRef = React.useRef<Socket | null>(null);
  const subscribedIdRef = React.useRef<string | null>(null);
  const pendingPositionRef = React.useRef<number | null>(null);
  const slowTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [live, setLive] = React.useState<ChallengeLiveState>({
    phase: 'idle',
    connected: false,
    state: null,
    matched: null,
    answerPending: false,
    answerSlow: false,
    answerError: null,
    error: null,
  });

  const clearSlowTimer = React.useCallback((): void => {
    if (slowTimerRef.current) {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
  }, []);

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
    const onDisconnect = (): void =>
      setLive((prev) => ({ ...prev, connected: false, answerPending: false, answerSlow: false }));
    const onState = (state: ChallengeStateDto): void => {
      // First sight of a challenge id means a match (PvP or solo) was made:
      // subscribe the socket so disconnects map to this challenge (grace
      // period) instead of looking like a stray socket.
      if (state?.id && subscribedIdRef.current !== state.id) {
        subscribedIdRef.current = state.id;
        socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.subscribe, { challengeId: state.id });
      }
      // An authoritative snapshot that includes our pending answer means the
      // server processed it even if the ack event was lost in transit.
      const pending = pendingPositionRef.current;
      const ackCovered =
        pending !== null &&
        (state.answeredPositions.includes(pending) || state.self.answeredCount > pending);
      if (ackCovered) {
        pendingPositionRef.current = null;
        clearSlowTimer();
      }
      setLive((prev) => ({
        ...prev,
        state,
        // The full snapshot supersedes the lightweight match payload.
        matched: state.status === 'COUNTDOWN' ? null : prev.matched,
        error: null,
        answerPending: ackCovered ? false : prev.answerPending,
        answerSlow: ackCovered ? false : prev.answerSlow,
        phase: phaseFromStatus(state.status, prev.phase),
      }));
    };
    const onStatus = (payload: { status: string }): void => {
      if (payload.status === 'SEARCHING') {
        setLive((prev) => ({ ...prev, phase: 'searching', error: null }));
      } else if (payload.status === 'CANCELLED') {
        clearSlowTimer();
        pendingPositionRef.current = null;
        setLive((prev) => ({
          ...prev,
          phase: 'cancelled',
          state: null,
          matched: null,
          answerPending: false,
          answerSlow: false,
          answerError: null,
        }));
      } else if (payload.status === 'MATCHED') {
        // Instant lightweight payload: enter the countdown immediately with
        // the server clock; the full state hydrates right after.
        setLive((prev) => ({
          ...prev,
          phase: 'countdown',
          matched: payload as ChallengeMatchedPayload,
          error: null,
        }));
      }
    };
    const onOpponentProgress = (progress: ChallengeOpponentProgressDto): void => {
      setLive((prev) => {
        if (!prev.state || prev.state.id !== progress.challengeId || !prev.state.opponent) {
          return prev;
        }
        if (prev.state.opponent.id !== progress.userId) {
          return prev;
        }
        return {
          ...prev,
          state: {
            ...prev.state,
            opponent: {
              ...prev.state.opponent,
              score: progress.score,
              answeredCount: progress.answeredCount,
            },
          },
        };
      });
    };
    const onAnswerAck = (ack: ChallengeAnswerAckDto): void => {
      if (!isAck(ack) || !ack.accepted) {
        return;
      }
      pendingPositionRef.current = null;
      clearSlowTimer();
      setLive((prev) => {
        if (!prev.state || prev.state.id !== ack.selfProgress.challengeId) {
          return { ...prev, answerPending: false, answerSlow: false };
        }
        return {
          ...prev,
          answerPending: false,
          answerSlow: false,
          answerError: null,
          state: {
            ...prev.state,
            question: ack.nextQuestion,
            self: {
              ...prev.state.self,
              scoreboard: ack.selfScoreboard ?? prev.state.self.scoreboard,
              answeredCount: ack.answeredCount,
            },
            answeredPositions: [...prev.state.answeredPositions, ack.position].sort(
              (a, b) => a - b,
            ),
            questionCount: Math.max(
              prev.state.questionCount,
              ack.nextQuestion ? ack.nextQuestion.position + 1 : prev.state.questionCount,
            ),
            opponent: prev.state.opponent
              ? {
                  ...prev.state.opponent,
                  score: ack.opponentProgress?.score ?? prev.state.opponent.score,
                  answeredCount:
                    ack.opponentProgress?.answeredCount ?? prev.state.opponent.answeredCount,
                }
              : prev.state.opponent,
          },
        };
      });
    };
    const onFinalizing = (payload: { challengeId: string }): void => {
      setLive((prev) => {
        if (prev.phase !== 'live' && prev.phase !== 'countdown') {
          return prev;
        }
        if (prev.state && prev.state.id !== payload.challengeId) {
          return prev;
        }
        clearSlowTimer();
        pendingPositionRef.current = null;
        return {
          ...prev,
          phase: 'finalizing',
          answerPending: false,
          answerSlow: false,
          answerError: null,
        };
      });
    };
    const onCompleted = (): void => {
      clearSlowTimer();
      pendingPositionRef.current = null;
      setLive((prev) => ({ ...prev, phase: 'completed', answerPending: false, answerSlow: false }));
    };
    const onError = (error: ChallengeSocketError): void =>
      setLive((prev) => ({
        ...prev,
        error,
        // A socket error while an answer is in flight almost always answers
        // it (validation/state/reading-time): surface inline, re-enable submit.
        answerPending: false,
        answerSlow: false,
        answerError: prev.answerPending ? error.message : prev.answerError,
      }));

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on(CHALLENGE_SOCKET_EVENTS.state, onState);
    socket.on(CHALLENGE_SOCKET_EVENTS.matchmakingStatus, onStatus);
    socket.on(CHALLENGE_SOCKET_EVENTS.opponentProgress, onOpponentProgress);
    socket.on(CHALLENGE_SOCKET_EVENTS.answerAck, onAnswerAck);
    socket.on(CHALLENGE_SOCKET_EVENTS.finalizing, onFinalizing);
    socket.on(CHALLENGE_SOCKET_EVENTS.completed, onCompleted);
    socket.on(CHALLENGE_SOCKET_EVENTS.error, onError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off(CHALLENGE_SOCKET_EVENTS.state, onState);
      socket.off(CHALLENGE_SOCKET_EVENTS.matchmakingStatus, onStatus);
      socket.off(CHALLENGE_SOCKET_EVENTS.opponentProgress, onOpponentProgress);
      socket.off(CHALLENGE_SOCKET_EVENTS.answerAck, onAnswerAck);
      socket.off(CHALLENGE_SOCKET_EVENTS.finalizing, onFinalizing);
      socket.off(CHALLENGE_SOCKET_EVENTS.completed, onCompleted);
      socket.off(CHALLENGE_SOCKET_EVENTS.error, onError);
    };
  }, [clearSlowTimer]);

  const startMatchmaking = React.useCallback(
    (domainSlug: string): void => {
      connect();
      clearSlowTimer();
      pendingPositionRef.current = null;
      setLive((prev) => ({
        ...prev,
        phase: 'searching',
        error: null,
        state: null,
        matched: null,
        answerPending: false,
        answerSlow: false,
        answerError: null,
      }));
      socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.startMatchmaking, { domainSlug });
    },
    [connect, clearSlowTimer],
  );

  const cancelMatchmaking = React.useCallback((): void => {
    socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.cancelMatchmaking);
    setLive((prev) => ({
      ...prev,
      phase: 'idle',
      state: null,
      matched: null,
      error: null,
      answerPending: false,
      answerSlow: false,
      answerError: null,
    }));
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
      // Guard double-taps: one answer in flight per question.
      let alreadyPending = false;
      setLive((prev) => {
        alreadyPending = prev.answerPending;
        if (alreadyPending) {
          return prev;
        }
        return { ...prev, answerPending: true, answerSlow: false, answerError: null };
      });
      if (alreadyPending) {
        return;
      }
      pendingPositionRef.current = input.position;
      clearSlowTimer();
      slowTimerRef.current = setTimeout(() => {
        setLive((prev) => (prev.answerPending ? { ...prev, answerSlow: true } : prev));
      }, SLOW_ANSWER_MS);
      socket.emit(CHALLENGE_SOCKET_EVENTS.answer, input);
    },
    [clearSlowTimer],
  );

  const leave = React.useCallback((): void => {
    subscribedIdRef.current = null;
    pendingPositionRef.current = null;
    clearSlowTimer();
    socketRef.current?.emit(CHALLENGE_SOCKET_EVENTS.leave);
    setLive({
      phase: 'idle',
      connected: false,
      state: null,
      matched: null,
      error: null,
      answerPending: false,
      answerSlow: false,
      answerError: null,
    });
  }, [clearSlowTimer]);

  const reset = React.useCallback((): void => {
    subscribedIdRef.current = null;
    pendingPositionRef.current = null;
    clearSlowTimer();
    setLive((prev) => ({
      ...prev,
      phase: 'idle',
      state: null,
      matched: null,
      error: null,
      answerPending: false,
      answerSlow: false,
      answerError: null,
    }));
  }, [clearSlowTimer]);

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
  /** Timed match length, seconds (env-driven, same for every domain). */
  durationSeconds: number;
}

export function useChallengeDomains() {
  return useQuery({
    queryKey: ['challenge', 'domains'],
    queryFn: () => apiFetch<ChallengeDomain[]>('/challenges/domains'),
    staleTime: 5 * 60_000,
  });
}

export const CHALLENGE_HISTORY_PAGE_SIZE = 10;

/** Offset-paginated history; keeps the previous page visible while fetching. */
export function useChallengeHistoryPage(
  offset: number,
  limit = CHALLENGE_HISTORY_PAGE_SIZE,
  domain?: string,
) {
  const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
  if (domain) {
    params.set('domain', domain);
  }
  return useQuery({
    queryKey: ['challenge', 'history', offset, limit, domain ?? 'all'],
    queryFn: () =>
      apiFetch<OffsetPage<ChallengeHistoryEntryDto>>(`/challenges/history?${params.toString()}`),
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

export function useChallengeHistoryStats(domain?: string) {
  return useQuery({
    queryKey: ['challenge', 'history-stats', domain ?? 'all'],
    queryFn: () =>
      apiFetch<ChallengeHistoryStatsDto>(
        `/challenges/history/stats${domain ? `?domain=${encodeURIComponent(domain)}` : ''}`,
      ),
    staleTime: 15_000,
  });
}

export function useChallengeResult(challengeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['challenge', 'result', challengeId],
    queryFn: () => apiFetch<ChallengeResultDto>(`/challenges/${challengeId}/result`),
    enabled: Boolean(challengeId) && enabled,
    staleTime: 30_000,
    // Ratings settle asynchronously (queue + free-tier lag): keep polling
    // the cheap result endpoint until the rating step lands or fails.
    refetchInterval: (query) => {
      const data = query.state.data as ChallengeResultDto | undefined;
      if (!data || data.isSolo) {
        return false;
      }
      return data.ratingStatus === 'PENDING' || data.ratingStatus === 'PROCESSING' ? 3000 : false;
    },
  });
}
