'use client';

import { Filter } from 'lucide-react';
import * as React from 'react';
import {
  Button,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@apteez/ui';
import {
  useCategories,
  useExamTags,
  useProblemsFeed,
  type ProblemFilters,
} from '@/hooks/use-problems';
import { ProblemList } from './problem-list';

const ALL = 'all';

const DIFFICULTIES = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'rating_desc', label: 'Rating: high to low' },
  { value: 'rating_asc', label: 'Rating: low to high' },
];

export interface ProblemBrowserProps {
  initialFilters?: ProblemFilters;
}

/**
 * Explore surface: database-backed filtering, sorting and cursor pagination.
 * All filtering happens server-side — this component only holds the UI state
 * and renders the shared problem list states.
 */
export function ProblemBrowser({ initialFilters }: ProblemBrowserProps): React.JSX.Element {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState(initialFilters?.category ?? ALL);
  const [difficulty, setDifficulty] = React.useState(initialFilters?.difficulty ?? ALL);
  const [exam, setExam] = React.useState(initialFilters?.exam ?? ALL);
  const [sort, setSort] = React.useState(initialFilters?.sort ?? 'newest');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const categories = useCategories();
  const examTags = useExamTags();

  const filters = React.useMemo<ProblemFilters>(
    () => ({
      ...(category !== ALL ? { category } : {}),
      ...(difficulty !== ALL ? { difficulty } : {}),
      ...(exam !== ALL ? { exam } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      sort,
    }),
    [category, difficulty, exam, debouncedSearch, sort],
  );

  const feed = useProblemsFeed(filters, 12);
  const hasActiveFilters =
    category !== ALL || difficulty !== ALL || exam !== ALL || debouncedSearch.length > 0;

  const reset = (): void => {
    setSearch('');
    setCategory(ALL);
    setDifficulty(ALL);
    setExam(ALL);
    setSort('newest');
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-2xl border border-border bg-elevated p-4">
        <SearchInput
          label="Search problems"
          placeholder="Search by title, statement, topic or category…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger aria-label="Category">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {(categories.data ?? []).map((item) => (
                <SelectItem key={item.id} value={item.slug}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger aria-label="Difficulty">
              <SelectValue placeholder="Difficulty" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any difficulty</SelectItem>
              {DIFFICULTIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={exam} onValueChange={setExam}>
            <SelectTrigger aria-label="Exam">
              <SelectValue placeholder="Exam" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any exam</SelectItem>
              {(examTags.data ?? []).map((tag) => (
                <SelectItem key={tag.id} value={tag.slug}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger aria-label="Sort order">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hasActiveFilters ? (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Filter className="size-3" aria-hidden />
                Filters applied server-side
              </p>
              <Button variant="ghost" size="sm" onClick={reset}>
                Clear filters
              </Button>
            </div>
          </>
        ) : null}
      </div>

      <ProblemList
        problems={feed.problems}
        isPending={feed.isPending}
        isError={feed.isError}
        hasNextPage={Boolean(feed.hasNextPage)}
        isFetchingNextPage={feed.isFetchingNextPage}
        onRetry={() => void feed.refetch()}
        onLoadMore={() => void feed.fetchNextPage()}
      />
    </div>
  );
}
