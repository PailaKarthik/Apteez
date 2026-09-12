import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AttemptResultDto, ProblemDetailDto } from '@apteez/types';
import { PracticeView } from '../practice-view';

const practiceMock = vi.hoisted(() => ({
  problem: {
    data: undefined as ProblemDetailDto | undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
  stats: { data: undefined as unknown },
  next: { data: undefined as { id: string } | undefined },
  startMutate: vi.fn(),
  startMutateAsync: vi.fn(),
  startReset: vi.fn(),
  submitMutateAsync: vi.fn(),
  submitReset: vi.fn(),
  submitIsPending: false,
  submitIsError: false,
  submitError: undefined as unknown,
  sync: vi.fn(),
}));

vi.mock('@/hooks/use-problems', () => ({
  useProblem: () => practiceMock.problem,
}));

vi.mock('@/hooks/use-practice', () => ({
  useProblemStats: () => ({ data: practiceMock.stats.data }),
  useNextProblem: () => ({ data: practiceMock.next.data }),
  useStartAttempt: () => ({
    data: { id: 'attempt-1' },
    mutate: practiceMock.startMutate,
    mutateAsync: practiceMock.startMutateAsync,
    reset: practiceMock.startReset,
  }),
  useSubmitAttempt: () => ({
    mutateAsync: practiceMock.submitMutateAsync,
    reset: practiceMock.submitReset,
    isPending: practiceMock.submitIsPending,
    isError: practiceMock.submitIsError,
    error: practiceMock.submitError,
  }),
  usePracticeCacheSync: () => ({ syncAfterSubmit: practiceMock.sync }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  practiceMock.submitIsPending = false;
  practiceMock.submitIsError = false;
  practiceMock.submitError = undefined;
});

function problem(): ProblemDetailDto {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    title: 'Time and Work: two workers',
    contentMode: 'TEXT_ONLY',
    difficulty: 'EASY',
    rating: 1080,
    category: { slug: 'quantitative', name: 'Quantitative Aptitude' },
    topic: { slug: 'time-and-work', name: 'Time and Work' },
    subtopic: null,
    examTags: [],
    optionCount: 2,
    hasImage: false,
    hasExplanation: true,
    hasShortcut: false,
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    accuracy: null,
    solvedCount: 0,
    statement: 'How many days?',
    assets: [],
    source: null,
    sourceYear: null,
    options: [
      { id: 'opt-a', position: 0, text: '7.2 days', assetUrl: null },
      { id: 'opt-b', position: 1, text: '6.5 days', assetUrl: null },
    ],
  };
}

function result(isCorrect: boolean): AttemptResultDto {
  return {
    attempt: {
      id: 'attempt-1',
      problemId: 'a0000000-0000-4000-8000-000000000001',
      context: 'PRACTICE',
      status: 'SUBMITTED',
      startedAt: '2026-01-01T00:00:00.000Z',
    },
    result: {
      selectedOptionId: isCorrect ? 'opt-a' : 'opt-b',
      correctOptionId: 'opt-a',
      isCorrect,
      explanation: 'Combined rate = 5/36.',
      shortcut: isCorrect ? 'Product-over-sum.' : null,
      timeSpentSeconds: 12,
    },
    problem: problem(),
  };
}

describe('PracticeView', () => {
  it('renders a loading skeleton without leaking content', () => {
    practiceMock.problem = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    expect(screen.queryByText('How many days?')).toBeNull();
  });

  it('renders an error state with retry', () => {
    practiceMock.problem = { data: undefined, isPending: false, isError: true, refetch: vi.fn() };
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('Could not load this problem')).toBeDefined();
  });

  it('hides the answer and explanation before submission', () => {
    practiceMock.problem = { data: problem(), isPending: false, isError: false, refetch: vi.fn() };
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('How many days?')).toBeDefined();
    expect(screen.getByText('Select an option to continue')).toBeDefined();
    expect(screen.queryByText(/Correct|Not quite/)).toBeNull();
    expect(screen.queryByText('Explanation')).toBeNull();
    expect(screen.getByRole('button', { name: 'Submit answer' }).hasAttribute('disabled')).toBe(
      true,
    );
  });

  it('enables submission after selecting an option', () => {
    practiceMock.problem = { data: problem(), isPending: false, isError: false, refetch: vi.fn() };
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    fireEvent.click(screen.getByText('7.2 days'));
    expect(practiceMock.startMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Ready to submit')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Submit answer' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('reveals a correct result with the explanation', async () => {
    practiceMock.problem = { data: problem(), isPending: false, isError: false, refetch: vi.fn() };
    practiceMock.submitMutateAsync.mockResolvedValueOnce(result(true));
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    fireEvent.click(screen.getByText('7.2 days'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await waitFor(() => expect(screen.getByText('Correct')).toBeDefined());
    expect(screen.getByText('Explanation')).toBeDefined();
    expect(screen.getByText('Shortcut')).toBeDefined();
    expect(practiceMock.sync).toHaveBeenCalledTimes(1);
  });

  it('reveals an incorrect result with the correct answer highlighted', async () => {
    practiceMock.problem = { data: problem(), isPending: false, isError: false, refetch: vi.fn() };
    practiceMock.submitMutateAsync.mockResolvedValueOnce(result(false));
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    fireEvent.click(screen.getByText('6.5 days'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
    await waitFor(() => expect(screen.getByText('Not quite')).toBeDefined());
    expect(screen.getByText('Explanation')).toBeDefined();
    expect(screen.queryByText('Shortcut')).toBeNull();
  });

  it('shows the personal solved summary when stats exist', () => {
    practiceMock.problem = { data: problem(), isPending: false, isError: false, refetch: vi.fn() };
    practiceMock.stats.data = {
      solved: true,
      attemptCount: 3,
      correctCount: 2,
      incorrectCount: 1,
      personalAccuracy: 67,
      averageTimeSeconds: 30,
      lastAttemptAt: '2026-01-01T00:00:00.000Z',
    };
    render(<PracticeView problemId="a0000000-0000-4000-8000-000000000001" />);
    expect(screen.getByText('Solved')).toBeDefined();
    expect(screen.getByText(/3 attempts/)).toBeDefined();
    expect(screen.getByText(/67% personal accuracy/)).toBeDefined();
  });
});
