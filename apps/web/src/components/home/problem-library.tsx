'use client';

import { Check, SearchX, Star } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { CursorPage, ProblemSummaryDto } from '@apteez/types';
import { difficultyForRating } from '@apteez/types';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@apteez/ui';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import { useFavoriteToggle } from '@/hooks/use-favorites';
import { useProblemsCount, type LibraryFilters } from '@/hooks/use-home';
import { useCategories, useExamTags, useProblemsFeed } from '@/hooks/use-problems';

const PAGE_SIZE = 12;

const DIFFICULTY_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
] as const;

const SOLVED_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'SOLVED', label: 'Solved' },
  { value: 'UNSOLVED', label: 'Unsolved' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating_desc', label: 'Hardest rated' },
  { value: 'rating_asc', label: 'Easiest rated' },
] as const;

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;
const DIFFICULTY_LABEL = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' } as const;

function ratingTone(rating: number): string {
  // Canonical bands: 1000–1200 easy, 1300–1600 medium, 1700–2000 hard.
  switch (difficultyForRating(rating)) {
    case 'EASY':
      return 'text-muted-foreground';
    case 'MEDIUM':
      return 'text-foreground';
    case 'HARD':
      return 'text-primary';
  }
}

function LibrarySkeletonRows({ rows = 8 }: { rows?: number }): React.JSX.Element {
  return (
    <>
      {Array.from({ length: rows }, (_, index) => (
        <tr key={index} className="animate-fade-in border-b border-border last:border-0" aria-hidden>
          <td className="px-3 py-3">
            <div className="skeleton-shine size-4 rounded-full" />
          </td>
          <td className="px-3 py-3">
            <div className="skeleton-shine h-4 w-48 max-w-full rounded-md" />
          </td>
          <td className="hidden px-3 py-3 sm:table-cell">
            <div className="skeleton-shine h-4 w-24 rounded-md" />
          </td>
          <td className="hidden px-3 py-3 text-right md:table-cell">
            <div className="skeleton-shine ml-auto h-4 w-12 rounded-md" />
          </td>
          <td className="hidden px-3 py-3 text-right md:table-cell">
            <div className="skeleton-shine ml-auto h-4 w-10 rounded-md" />
          </td>
          <td className="px-3 py-3">
            <div className="skeleton-shine h-5 w-16 rounded-full" />
          </td>
          <td className="px-3 py-3 text-right">
            <div className="skeleton-shine ml-auto size-4 rounded-full" />
          </td>
        </tr>
      ))}
    </>
  );
}

/**
 * Home problem library: live search, difficulty + solved filters and a
 * cursor-paginated table (rating, accuracy, favorite, solved state). Rows,
 * counts and filters are all server-driven — the header total uses
 * `GET /problems/count` with the identical filters, so it can never drift
 * from the rows.
 */
export function ProblemLibrary(): React.JSX.Element {
  const { isAuthenticated } = useAuth();
  const [search, setSearch] = React.useState('');
  const [difficulty, setDifficulty] =
    React.useState<(typeof DIFFICULTY_FILTERS)[number]['value']>('ALL');
  const [solved, setSolved] = React.useState<(typeof SOLVED_FILTERS)[number]['value']>('ALL');
  const [category, setCategory] = React.useState('all');
  const [exam, setExam] = React.useState('all');
  const [sort, setSort] =
    React.useState<(typeof SORT_OPTIONS)[number]['value']>('newest');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  const { data: categories } = useCategories();
  const { data: examTags } = useExamTags();

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = React.useMemo<LibraryFilters>(
    () => ({
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(difficulty !== 'ALL' ? { difficulty } : {}),
      ...(isAuthenticated && solved !== 'ALL' ? { solved: solved === 'SOLVED' } : {}),
      ...(category !== 'all' ? { category } : {}),
      ...(exam !== 'all' ? { exam } : {}),
    }),
    [debouncedSearch, difficulty, solved, isAuthenticated, category, exam],
  );

  const feed = useProblemsFeed({ ...filters, sort }, PAGE_SIZE);
  const count = useProblemsCount(filters);

  const activeFilterCount =
    (debouncedSearch ? 1 : 0) +
    (difficulty !== 'ALL' ? 1 : 0) +
    (isAuthenticated && solved !== 'ALL' ? 1 : 0) +
    (category !== 'all' ? 1 : 0) +
    (exam !== 'all' ? 1 : 0) +
    (sort !== 'newest' ? 1 : 0);

  const resetFilters = React.useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    setDifficulty('ALL');
    setSolved('ALL');
    setCategory('all');
    setExam('all');
    setSort('newest');
  }, []);
  const favoriteToggle = useFavoriteToggle();
  const queryClient = useQueryClient();

  const problems = feed.problems;
  const total = count.data?.total;

  /**
   * Instant star flip across every cached library page. The shared toggle
   * already reconciles with the server (it invalidates `['problems']` on
   * settle), so this is purely the immediate feedback — rolled back below
   * if the request actually fails.
   */
  const flipStar = React.useCallback(
    (problemId: string, next: boolean) => {
      void queryClient.setQueriesData<InfiniteData<CursorPage<ProblemSummaryDto>>>(
        { queryKey: ['problems', 'feed'] },
        (old) => {
          if (!old) {
            return old;
          }
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                item.id === problemId ? { ...item, isFavorited: next } : item,
              ),
            })),
          };
        },
      );
    },
    [queryClient],
  );

  const toggleFavorite = React.useCallback(
    (problemId: string, next: boolean) => {
      flipStar(problemId, next);
      favoriteToggle.mutate(
        { problemId, next },
        {
          onSuccess: (result) => {
            // Authoritative state wins over the optimistic flip.
            flipStar(problemId, result.favorited);
            toast.success(result.favorited ? 'Saved to Favorites' : 'Removed from Favorites');
          },
          onError: (error) => {
            flipStar(problemId, !next);
            toast.error(
              error instanceof ApiError ? error.message : 'Could not update favorites. Try again.',
            );
          },
        },
      );
    },
    [favoriteToggle, flipStar],
  );

  // Lazy loading: fetch the next cursor page as the sentinel scrolls into
  // view; the button below remains as the explicit fallback.
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !feed.hasNextPage || feed.isFetchingNextPage) {
      return;
    }
    // jsdom and very old browsers lack IntersectionObserver — the explicit
    // "Load more" button below covers those environments.
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void feed.fetchNextPage();
        }
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [feed.hasNextPage, feed.isFetchingNextPage, feed.fetchNextPage, problems.length]);

  return (
    <section aria-label="Problem library" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="icon-tile size-10" aria-hidden>
            <span className="text-base font-extrabold">Q</span>
          </span>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Problem Library</h2>
            <span
              className="block h-0.5 w-10 rounded-full bg-gradient-to-r from-primary to-accent-foreground"
              aria-hidden
            />
          </div>
        </div>
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/[0.07] px-3 py-1 text-sm text-muted-foreground"
          aria-live="polite"
        >
          {count.isPending ? (
            <span className="typing-dots text-xs font-medium">Counting</span>
          ) : count.isError ? (
            'Count unavailable'
          ) : (
            <span className="gradient-text-cool font-metric font-bold">
              {`${(total ?? 0).toLocaleString()} ${(total ?? 0) === 1 ? 'problem' : 'problems'}`}
            </span>
          )}
        </div>
      </div>

      <div className="glass sticky top-top-bar z-10 space-y-2.5 rounded-2xl border border-border p-3 shadow-sm">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <SearchInput
              label="Search problems"
              placeholder="Search problems… try “probability”, “trains”…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Difficulty filter"
          >
            {DIFFICULTY_FILTERS.map((option) => (
              <Button
                key={option.value}
                size="sm"
                variant={difficulty === option.value ? 'default' : 'outline'}
                onClick={() => setDifficulty(option.value)}
                className={cn(
                  'transition-all duration-200',
                  difficulty === option.value && 'shadow-md shadow-primary/25',
                )}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {isAuthenticated ? (
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Solved filter"
            >
              {SOLVED_FILTERS.map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={solved === option.value ? 'default' : 'outline'}
                  onClick={() => setSolved(option.value)}
                  className={cn(
                    'transition-all duration-200',
                    solved === option.value && 'shadow-md shadow-primary/25',
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid flex-1 grid-cols-1 gap-2 min-[480px]:grid-cols-3">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger aria-label="Section filter" className="w-full">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {(categories ?? []).map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={exam} onValueChange={setExam}>
              <SelectTrigger aria-label="Exam folder filter" className="w-full">
                <SelectValue placeholder="All exams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All exams</SelectItem>
                {(examTags ?? []).map((item) => (
                  <SelectItem key={item.slug} value={item.slug}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(value) => setSort(value as typeof sort)}
            >
              <SelectTrigger aria-label="Sort order" className="w-full">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {activeFilterCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="shrink-0 gap-1.5 text-muted-foreground transition-all hover:text-destructive"
            >
              Reset
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 font-metric text-[11px] font-bold text-primary">
                {activeFilterCount}
              </span>
            </Button>
          ) : null}
        </div>
      </div>

      {feed.isPending ? (
        <div
          className="animate-fade-in overflow-x-auto rounded-2xl border border-border"
          aria-busy="true"
          aria-label="Loading problems"
        >
          <div className="loading-rail h-1" aria-hidden>
            <span />
          </div>
          <table className="w-full min-w-[760px] text-left text-sm">
            <tbody>
              <LibrarySkeletonRows />
            </tbody>
          </table>
        </div>
      ) : feed.isError ? (
        <ErrorState
          title="Could not load problems"
          description="The question library did not respond. Check your connection and try again."
          onRetry={() => {
            void feed.refetch();
            void count.refetch();
          }}
        />
      ) : problems.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No problems match these filters"
          description="Try widening the difficulty, clearing the search term or picking All instead of Solved."
        />
      ) : (
        <div className="animate-scale-in overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="w-10 px-3 py-2 font-medium" scope="col">
                  <span className="sr-only">Solved</span>
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Problem
                </th>
                <th className="hidden px-3 py-2 font-medium sm:table-cell" scope="col">
                  Topic
                </th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell" scope="col">
                  Rating
                </th>
                <th className="hidden px-3 py-2 text-right font-medium md:table-cell" scope="col">
                  Accuracy
                </th>
                <th className="px-3 py-2 font-medium" scope="col">
                  Difficulty
                </th>
                <th className="w-10 px-3 py-2 text-right font-medium" scope="col">
                  <span className="sr-only">Favorite</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem, index) => (
                <tr
                  key={problem.id}
                  className="row-enter row-glow border-b border-border last:border-0"
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                >
                  <td className="px-3 py-2.5 align-middle">
                    {problem.isSolved ? (
                      <span className="flex size-4 items-center justify-center text-success">
                        <Check className="size-4" aria-label="Solved" />
                      </span>
                    ) : (
                      <span className="font-metric text-xs text-muted-foreground">{index + 1}</span>
                    )}
                  </td>
                  <td className="max-w-xs px-3 py-2.5">
                    <Link
                      href={`/problems/${problem.id}`}
                      className="group/link block truncate font-medium text-foreground transition-colors hover:text-primary"
                    >
                      <span className="bg-gradient-to-r from-primary to-primary bg-[length:0%_2px] bg-left-bottom bg-no-repeat transition-[background-size] duration-300 group-hover/link:bg-[length:100%_2px]">
                        {problem.title}
                      </span>
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {problem.subtopic?.name ?? problem.category.name}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2.5 text-muted-foreground sm:table-cell">
                    {problem.topic?.name ?? 'General'}
                  </td>
                  <td
                    className={cn(
                      'hidden px-3 py-2.5 text-right font-metric font-semibold md:table-cell',
                      ratingTone(problem.rating),
                    )}
                  >
                    {problem.rating}
                  </td>
                  <td className="hidden px-3 py-2.5 text-right font-metric text-muted-foreground md:table-cell">
                    {problem.accuracy === null ? '—' : `${problem.accuracy}%`}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={DIFFICULTY_TONE[problem.difficulty]}>
                      {DIFFICULTY_LABEL[problem.difficulty]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {isAuthenticated ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        aria-label={
                          problem.isFavorited ? 'Remove from favorites' : 'Save to favorites'
                        }
                        aria-pressed={Boolean(problem.isFavorited)}
                        onClick={() => toggleFavorite(problem.id, !problem.isFavorited)}
                      >
                        <Star
                          className={cn(
                            'size-4',
                            problem.isFavorited ? 'fill-gold text-gold' : 'text-muted-foreground',
                          )}
                          aria-hidden
                        />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0"
                        aria-label="Sign in to save favorites"
                        asChild
                      >
                        <Link href="/login">
                          <Star className="size-4 text-muted-foreground/50" aria-hidden />
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {feed.isFetchingNextPage ? <LibrarySkeletonRows rows={4} /> : null}
            </tbody>
          </table>
        </div>
      )}

      {!feed.isPending && !feed.isError && problems.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          {feed.hasNextPage ? (
            <Button
              variant="outline"
              onClick={() => void feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
              className="btn-sheen min-w-52 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/15"
            >
              {feed.isFetchingNextPage ? (
                <span className="typing-dots">Loading more</span>
              ) : (
                'Load more problems'
              )}
            </Button>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              End of results — refine your filters to see more.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
