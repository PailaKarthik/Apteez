'use client';

import { X } from 'lucide-react';
import { Button, Card, CardContent } from '@apteez/ui';
import { ProblemList } from '@/components/problems/problem-list';
import { useProblemsFeed, type ProblemFilters } from '@/hooks/use-problems';

export interface FolderFilter {
  exam?: string;
  category?: string;
}

/**
 * Inline folder contents: the folder's live problems rendered continuously
 * on the same page — no navigation, no redirects. Reuses the shared
 * ProblemList (skeletons, empty/error states, cursor load-more) with a
 * server-side exam/category filter.
 */
export function FolderProblems({
  title,
  subtitle,
  filter,
  onClose,
}: {
  title: string;
  subtitle: string;
  filter: FolderFilter;
  onClose: () => void;
}): React.JSX.Element {
  const filters: ProblemFilters = {
    ...(filter.exam ? { exam: filter.exam } : {}),
    ...(filter.category ? { category: filter.category } : {}),
    sort: 'newest',
  };
  const feed = useProblemsFeed(filters, 8);

  return (
    <Card className="overflow-hidden border-primary/30">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
              {subtitle}
            </p>
            <p className="truncate text-base font-bold text-foreground">{title}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close folder"
            className="shrink-0"
          >
            <X aria-hidden />
            <span className="hidden sm:inline">Close</span>
          </Button>
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
      </CardContent>
    </Card>
  );
}
