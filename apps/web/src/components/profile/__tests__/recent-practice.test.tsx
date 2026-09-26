import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecentPractice } from '../recent-practice';

const mocks = vi.hoisted(() => ({
  feed: {
    items: [] as Array<{
      id: string;
      problem: { id: string; title: string };
      category: { name: string; slug: string };
      topic: { name: string; slug: string };
      difficulty: 'EASY' | 'MEDIUM' | 'HARD';
      isCorrect: boolean;
    }>,
    total: 0,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  },
}));

vi.mock('@/hooks/use-practice', () => ({
  useRecentPracticeFeed: () => mocks.feed,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.feed.items = [];
  mocks.feed.total = 0;
  mocks.feed.isPending = false;
  mocks.feed.isError = false;
  mocks.feed.hasNextPage = false;
  mocks.feed.isFetchingNextPage = false;
});

function item(id: string, title: string) {
  return {
    id,
    problem: { id: `p-${id}`, title },
    category: { name: 'Quant', slug: 'quant' },
    topic: { name: 'Arithmetic', slug: 'arithmetic' },
    difficulty: 'EASY' as const,
    isCorrect: true,
  };
}

describe('RecentPractice', () => {
  it('renders offset-paged rows with counts', () => {
    mocks.feed.items = [item('s1', 'Percentages'), item('s2', 'Ratios')];
    mocks.feed.total = 25;
    render(<RecentPractice />);
    expect(screen.getByText('Percentages')).toBeDefined();
    expect(screen.getByText('Ratios')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
    expect(screen.getByText('25')).toBeDefined();
  });

  it('offers Show more while pages remain and fetches next', () => {
    mocks.feed.items = [item('s1', 'Percentages')];
    mocks.feed.total = 25;
    mocks.feed.hasNextPage = true;
    render(<RecentPractice />);
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(mocks.feed.fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('hides Show more on the last page', () => {
    mocks.feed.items = [item('s1', 'Percentages')];
    mocks.feed.total = 1;
    render(<RecentPractice />);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('retries after a load failure', () => {
    mocks.feed.isError = true;
    render(<RecentPractice />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.feed.refetch).toHaveBeenCalledTimes(1);
  });
});
