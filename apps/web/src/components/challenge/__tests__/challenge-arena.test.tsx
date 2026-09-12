import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChallengeStateDto } from '@apteez/types';
import { ChallengeArena } from '../challenge-arena';

const mocks = vi.hoisted(() => ({
  live: {
    phase: 'idle' as string,
    connected: true,
    state: null as ChallengeStateDto | null,
    error: null as { code: string; message: string } | null,
  },
  startMatchmaking: vi.fn(),
  cancelMatchmaking: vi.fn(),
  submitAnswer: vi.fn(),
  leave: vi.fn(),
  reset: vi.fn(),
  domains: {
    data: [
      { slug: 'quantitative', name: 'Quantitative Aptitude', icon: null, problemCount: 4 },
      { slug: 'logical-reasoning', name: 'Logical Reasoning', icon: null, problemCount: 0 },
    ],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  result: { data: undefined as unknown, isPending: false, isError: false, refetch: vi.fn() },
}));

vi.mock('@/hooks/use-challenge', () => ({
  useChallenge: () => ({
    ...mocks.live,
    connect: vi.fn(),
    startMatchmaking: mocks.startMatchmaking,
    cancelMatchmaking: mocks.cancelMatchmaking,
    subscribe: vi.fn(),
    submitAnswer: mocks.submitAnswer,
    leave: mocks.leave,
    reset: mocks.reset,
  }),
  useChallengeDomains: () => mocks.domains,
  useChallengeResult: () => mocks.result,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.live.phase = 'idle';
  mocks.live.state = null;
  mocks.live.connected = true;
  mocks.live.error = null;
});

function liveState(): ChallengeStateDto {
  return {
    id: 'c1',
    domainSlug: 'quantitative',
    domainName: 'Quantitative Aptitude',
    status: 'LIVE',
    config: {
      domainSlug: 'quantitative',
      questionCount: 8,
      durationSeconds: 300,
      minReadingSeconds: 3,
      initialRatingWindow: 150,
      ratingWindowGrowthPerSecond: 4,
      maxRatingWindow: 600,
      reconnectGraceSeconds: 45,
      countdownSeconds: 5,
    },
    self: {
      id: 'u1',
      rating: 1000,
      scoreboard: { correct: 1, wrong: 0, unanswered: 0, score: 1 },
      answeredCount: 1,
    },
    opponent: {
      id: 'u2',
      username: 'rival',
      displayName: 'Rival',
      avatarKey: null,
      rating: 1010,
      score: 0,
      answeredCount: 1,
      connected: true,
    },
    serverTime: new Date().toISOString(),
    countdownEndsAt: null,
    startedAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 120_000).toISOString(),
    question: {
      position: 1,
      problemId: 'p1',
      title: 'Percentages: successive discount',
      statement: 'What is the final price?',
      difficulty: 'EASY',
      contentMode: 'TEXT_ONLY',
      assets: [],
      options: [
        { id: 'o1', position: 0, text: '1440', assetUrl: null },
        { id: 'o2', position: 1, text: '1400', assetUrl: null },
      ],
      answerableAt: new Date(Date.now() - 1000).toISOString(),
    },
    questionCount: 8,
    answeredPositions: [0],
  };
}

describe('ChallengeArena', () => {
  it('lists domains and starts matchmaking on selection', () => {
    render(<ChallengeArena />);
    expect(screen.getByText('Quantitative Aptitude')).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: /Find opponent/ })[0]!);
    expect(mocks.startMatchmaking).toHaveBeenCalledWith('quantitative');
  });

  it('disables domains with no published problems', () => {
    render(<ChallengeArena />);
    const buttons = screen.getAllByRole('button', { name: /Find opponent/ });
    expect(buttons[1]?.hasAttribute('disabled')).toBe(true);
  });

  it('shows the matchmaking state with a cancel action', () => {
    mocks.live.phase = 'searching';
    render(<ChallengeArena />);
    expect(screen.getByText('Finding an opponent…')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel search' }));
    expect(mocks.cancelMatchmaking).toHaveBeenCalledTimes(1);
  });

  it('renders the countdown with the opponent and score rule', () => {
    const state = liveState();
    mocks.live.phase = 'countdown';
    mocks.live.state = {
      ...state,
      status: 'COUNTDOWN',
      countdownEndsAt: new Date(Date.now() + 5000).toISOString(),
      question: null,
    };
    render(<ChallengeArena />);
    expect(screen.getByText('Opponent found')).toBeDefined();
    expect(screen.getByText('Rival')).toBeDefined();
    expect(screen.getByText(/\+1 correct \/ −1 wrong/)).toBeDefined();
  });

  it('renders the live question and submits the selected option', () => {
    mocks.live.phase = 'live';
    mocks.live.state = liveState();
    render(<ChallengeArena />);
    expect(screen.getByText('Percentages: successive discount')).toBeDefined();
    fireEvent.click(screen.getByText('1440'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    expect(mocks.submitAnswer).toHaveBeenCalledTimes(1);
    expect(mocks.submitAnswer.mock.calls[0]?.[0]).toMatchObject({
      challengeId: 'c1',
      position: 1,
      selectedOptionId: 'o1',
    });
  });

  it('disables submission until an option is selected', () => {
    mocks.live.phase = 'live';
    mocks.live.state = liveState();
    render(<ChallengeArena />);
    expect(screen.getByRole('button', { name: 'Submit answer' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(screen.getByText('1440'));
    expect(screen.getByRole('button', { name: 'Submit answer' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('renders the win result with both scores', () => {
    const state = liveState();
    mocks.live.phase = 'completed';
    mocks.live.state = { ...state, status: 'COMPLETED', question: null };
    mocks.result.data = {
      id: 'c1',
      domainSlug: 'quantitative',
      domainName: 'Quantitative Aptitude',
      outcome: 'PLAYER1_WIN',
      completionReason: 'COMPLETED',
      winnerId: 'u1',
      durationSeconds: 120,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      player1: {
        id: 'u1',
        username: 'me',
        displayName: 'Me',
        avatarKey: null,
        rating: 1000,
        correct: 5,
        wrong: 1,
        unanswered: 2,
        score: 4,
      },
      player2: {
        id: 'u2',
        username: 'rival',
        displayName: 'Rival',
        avatarKey: null,
        rating: 1000,
        correct: 3,
        wrong: 2,
        unanswered: 3,
        score: 1,
      },
      questions: [],
      ratingChange: { self: null, opponent: null },
    };
    render(<ChallengeArena />);
    expect(screen.getByText('Victory')).toBeDefined();
    expect(screen.getByRole('button', { name: /Play again/ })).toBeDefined();
  });

  it('surfaces socket errors', () => {
    mocks.live.error = { code: 'AUTH_REQUIRED', message: 'Sign in to play.' };
    render(<ChallengeArena />);
    expect(screen.getByRole('alert').textContent).toContain('Sign in to play.');
  });
});
