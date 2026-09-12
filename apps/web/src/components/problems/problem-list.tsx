'use client';

import { SearchX } from 'lucide-react';
import type { ProblemSummaryDto } from '@apteez/types';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  Skeleton,
} from '@apteez/ui';
import { ProblemCard } from './problem-card';

export function ProblemCardSkeleton(): React.JSX.Element {
  return (
    <Card>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-8 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export interface ProblemListProps {
  problems: ProblemSummaryDto[];
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}

/**
 * Shared problem grid with the four reusable states from the design system:
 * skeleton loading, empty results, error + retry, and cursor "load more".
 */
export function ProblemList({
  problems,
  isPending,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onRetry,
  onLoadMore,
}: ProblemListProps): React.JSX.Element {
  if (isPending) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        {Array.from({ length: 6 }, (_, index) => (
          <ProblemCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="Could not load problems"
        description="The question library did not respond. Check your connection and try again."
        onRetry={onRetry}
      />
    );
  }

  if (problems.length === 0) {
    return (
      <EmptyState
        icon={SearchX}
        title="No problems match these filters"
        description="Try widening the difficulty, clearing the search term or picking another topic."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {problems.map((problem) => (
          <ProblemCard key={problem.id} problem={problem} />
        ))}
      </div>
      {isFetchingNextPage ? (
        <LoadingState title="Loading more problems…" />
      ) : hasNextPage ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore}>
            Load more problems
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          End of results — refine your filters to see more.
        </p>
      )}
    </div>
  );
}
