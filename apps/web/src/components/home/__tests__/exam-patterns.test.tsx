import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExamPatterns } from '../exam-patterns';

const patternsMock = vi.hoisted(() => ({
  data: undefined as
    | Array<{
        id: string;
        name: string;
        slug: string;
        description: string | null;
        problemCount: number;
        topCategories: Array<{ name: string; slug: string; problemCount: number }>;
        difficultyMix: { easy: number; medium: number; hard: number };
        difficultyBand: string;
      }>
    | undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));

const feedMock = vi.hoisted(() => ({
  problems: [] as Array<{ id: string; title: string }>,
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
}));

vi.mock('@/hooks/use-home', () => ({
  useExamPatterns: () => patternsMock,
}));

vi.mock('@/hooks/use-problems', () => ({
  useProblemsFeed: () => feedMock,
  usePrefetchProblemsFeed: () => () => undefined,
}));

function renderPatterns(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ExamPatterns />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  patternsMock.data = undefined;
  patternsMock.isPending = false;
  patternsMock.isError = false;
  feedMock.problems = [];
  feedMock.isPending = false;
  feedMock.isError = false;
});

const SSC = {
  id: 'e1',
  name: 'SSC',
  slug: 'ssc',
  description: null,
  problemCount: 12,
  topCategories: [
    { name: 'Quantitative', slug: 'quant', problemCount: 8 },
    { name: 'Logical', slug: 'logical', problemCount: 4 },
  ],
  difficultyMix: { easy: 8, medium: 4, hard: 0 },
  difficultyBand: 'Easy–Med',
};

describe('ExamPatterns', () => {
  it('shows skeleton folders while loading', () => {
    patternsMock.isPending = true;
    renderPatterns();
    expect(screen.getByLabelText(/loading exam patterns/i)).toBeDefined();
  });

  it('renders live folders with counts, bands and mix bars', () => {
    patternsMock.data = [SSC];
    renderPatterns();
    expect(screen.getByText('SSC')).toBeDefined();
    expect(screen.getByText(/12 problems/)).toBeDefined();
    expect(screen.getByText('Quantitative')).toBeDefined();
    expect(screen.getByText(/easy–med/i)).toBeDefined();
    // No navigation: cards are expand buttons, not links.
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: /ssc.*show problems/i })).toBeDefined();
  });

  it('expands a folder inline without redirecting', () => {
    patternsMock.data = [SSC];
    renderPatterns();
    fireEvent.click(screen.getByRole('button', { name: /ssc.*show problems/i }));
    expect(screen.getByText(/no problems match these filters/i)).toBeDefined();
    // Collapse again.
    fireEvent.click(screen.getByRole('button', { name: /ssc.*collapse/i }));
    expect(screen.queryByText(/no problems match these filters/i)).toBeNull();
  });

  it('shows an honest empty state instead of static folders', () => {
    patternsMock.data = [];
    renderPatterns();
    expect(screen.getByText(/no exam folders yet/i)).toBeDefined();
  });

  it('shows an error with retry', () => {
    patternsMock.isError = true;
    renderPatterns();
    expect(screen.getByText(/could not load exam patterns/i)).toBeDefined();
  });
});
