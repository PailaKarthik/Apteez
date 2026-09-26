'use client';

import { Badge, Card, CardContent, CardTitle, Skeleton } from '@apteez/ui';
import { ProblemCard } from './problem-card';
import { ApiError } from '@/lib/api-client';
import { useSimilarProblems } from '@/hooks/use-search';

/**
 * Similar problems rail. Shows real canonical problems from vector retrieval
 * (or the deterministic fallback) with the retrieval source labeled —
 * never fabricated questions. Empty means "no close matches", not an error.
 */
export function SimilarProblems({ problemId }: { problemId: string }): React.JSX.Element {
  const { data, isLoading, isError, error, refetch } = useSimilarProblems(problemId);

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-card-title">Similar problems</CardTitle>
          {data && data.items.length > 0 && data.items[0]?.source === 'lexical-fallback' ? (
            <Badge variant="outline">Topic match</Badge>
          ) : null}
        </div>
        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-label="Loading similar problems">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : isError ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground" role="alert">
              {error instanceof ApiError
                ? error.message
                : 'Similar problems are unavailable right now.'}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm font-medium text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No close matches in the library yet — try nearby topics instead.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.items.slice(0, 4).map((hit) => (
              <ProblemCard key={hit.problem.id} problem={hit.problem} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
