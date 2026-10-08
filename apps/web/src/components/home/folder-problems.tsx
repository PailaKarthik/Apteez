'use client';

import * as React from 'react';
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

  // The panel is dismissible: Escape closes it, just like a dialog.
  // Typing in inputs/textareas must never trigger it.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Card className="animate-scale-in gradient-border overflow-hidden shadow-lg shadow-primary/10">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-metadata uppercase tracking-[0.14em] text-primary">
              <span className="live-dot" aria-hidden />
              {subtitle}
            </p>
            <p className="mt-1 truncate text-base font-bold text-foreground">{title}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Close folder"
            className="shrink-0 transition-all duration-200 hover:rotate-90 hover:bg-destructive/10 hover:text-destructive"
          >
            <X aria-hidden />
            <span className="hidden sm:inline">Close</span>
          </Button>
        </div>
        {feed.isPending ? (
          <div className="loading-rail h-0.5" aria-hidden>
            <span />
          </div>
        ) : null}
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
