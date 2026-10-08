import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProblemLibrary } from '../problem-library';

function renderLibrary(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProblemLibrary />
    </QueryClientProvider>,
  );
}

function problem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    title: 'Boats & Streams',
    contentMode: 'TEXT_ONLY',
    difficulty: 'EASY',
    rating: 1120,
    category: { slug: 'quantitative', name: 'Quantitative' },
    topic: { slug: 'boats-streams', name: 'Quantitative' },
    subtopic: null,
    examTags: [],
    optionCount: 4,
    hasImage: false,
    hasExplanation: true,
    hasShortcut: false,
    publishedAt: null,
    createdAt: new Date().toISOString(),
    accuracy: 72,
    solvedCount: 5,
    isSolved: false,
    isFavorited: false,
    ...overrides,
  };
}

const feedMock = vi.hoisted(() => ({
  problems: [] as Array<ReturnType<typeof problem>>,
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
}));

const countMock = vi.hoisted(() => ({
  data: undefined as { total: number } | undefined,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
}));

const authMock = vi.hoisted(() => ({ isAuthenticated: false as boolean }));

const favoriteMock = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('@/hooks/use-problems', () => ({
  useProblemsFeed: () => feedMock,
  useCategories: () => ({ data: [{ slug: 'quantitative', name: 'Quantitative' }] }),
  useExamTags: () => ({ data: [{ slug: 'ssc', name: 'SSC' }] }),
}));

vi.mock('@/hooks/use-home', () => ({
  useProblemsCount: () => countMock,
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => authMock,
}));

vi.mock('@/hooks/use-favorites', () => ({
  useFavoriteToggle: () => favoriteMock,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  feedMock.problems = [];
  feedMock.isPending = false;
  feedMock.isError = false;
  feedMock.hasNextPage = false;
  feedMock.isFetchingNextPage = false;
  countMock.data = undefined;
  countMock.isPending = false;
  countMock.isError = false;
  authMock.isAuthenticated = false;
  favoriteMock.isPending = false;
});

describe('ProblemLibrary', () => {
  it('shows skeleton rows while loading', () => {
    feedMock.isPending = true;
    countMock.isPending = true;
    renderLibrary();
    expect(screen.getByLabelText(/loading problems/i)).toBeDefined();
  });

  it('renders the live count and real rows with metadata', () => {
    feedMock.problems = [problem()];
    countMock.data = { total: 12 };
    renderLibrary();
    expect(screen.getByText('12 problems')).toBeDefined();
    expect(screen.getByText('Boats & Streams')).toBeDefined();
    expect(screen.getByText('1120')).toBeDefined();
    expect(screen.getByText('72%')).toBeDefined();
    // Difficulty chip + row badge share the label.
    expect(screen.getAllByText('Easy').length).toBeGreaterThanOrEqual(2);
  });

  it('hides solved filters for signed-out callers', () => {
    feedMock.problems = [problem()];
    countMock.data = { total: 1 };
    renderLibrary();
    expect(screen.queryByRole('group', { name: /solved filter/i })).toBeNull();
  });

  it('shows solved filters and favorite toggles for signed-in callers', () => {
    authMock.isAuthenticated = true;
    feedMock.problems = [problem({ id: 'p2', isSolved: true, isFavorited: false })];
    countMock.data = { total: 1 };
    renderLibrary();
    expect(screen.getByRole('group', { name: /solved filter/i })).toBeDefined();
    expect(screen.getByLabelText('Solved')).toBeDefined();
    const star = screen.getByRole('button', { name: /save to favorites/i });
    fireEvent.click(star);
    expect(favoriteMock.mutate).toHaveBeenCalledWith(
      { problemId: 'p2', next: true },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
  });

  it('routes signed-out callers to login instead of a dead star', () => {
    feedMock.problems = [problem()];
    countMock.data = { total: 1 };
    renderLibrary();
    const link = screen.getByRole('link', { name: /sign in to save favorites/i });
    expect(link.getAttribute('href')).toBe('/login');
  });

  it('shows an error with retry and no fabricated rows', () => {
    feedMock.isError = true;
    renderLibrary();
    expect(screen.getByText(/could not load problems/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(feedMock.refetch).toHaveBeenCalled();
  });

  it('offers section, exam and sort filters plus a reset', () => {
    feedMock.problems = [problem()];
    countMock.data = { total: 1 };
    renderLibrary();
    expect(screen.getByLabelText(/section filter/i)).toBeDefined();
    expect(screen.getByLabelText(/exam folder filter/i)).toBeDefined();
    expect(screen.getByLabelText(/sort order/i)).toBeDefined();
    // No filters active yet — no reset button.
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Easy' }));
    const reset = screen.getByRole('button', { name: /reset/i });
    expect(reset).toBeDefined();
    fireEvent.click(reset);
    expect(screen.queryByRole('button', { name: /reset/i })).toBeNull();
  });

  it('loads the next cursor page on demand', () => {
    feedMock.problems = [problem()];
    feedMock.hasNextPage = true;
    countMock.data = { total: 25 };
    renderLibrary();
    fireEvent.click(screen.getByText(/load more problems/i));
    expect(feedMock.fetchNextPage).toHaveBeenCalled();
  });
});
