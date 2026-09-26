'use client';

import * as React from 'react';
import {
  Badge,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  cn,
} from '@apteez/ui';
import { FolderOpen } from 'lucide-react';
import { SectionHeader } from '@apteez/ui';
import type { ExamPatternDto } from '@apteez/types';
import { useExamPatterns } from '@/hooks/use-home';
import { usePrefetchProblemsFeed } from '@/hooks/use-problems';
import { FolderProblems } from './folder-problems';

function ExamPatternSkeletons(): React.JSX.Element {
  return (
    <div
      className="flex gap-2.5 overflow-hidden"
      aria-busy="true"
      aria-label="Loading exam patterns"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} className="w-48 shrink-0">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center gap-2">
              <Skeleton className="size-9 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
function PatternCard({
  pattern,
  selected,
  onSelect,
}: {
  pattern: ExamPatternDto;
  selected: boolean;
  onSelect: () => void;
}): React.JSX.Element {
  const prefetchFeed = usePrefetchProblemsFeed();
  // Warm the folder's first page on hover/focus so tapping opens instantly.
  const warm = (): void => {
    prefetchFeed({ exam: pattern.slug, sort: 'newest' }, 8);
  };
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={warm}
      onFocus={warm}
      aria-expanded={selected}
      aria-label={`${pattern.name}, ${pattern.problemCount} problems. ${selected ? 'Collapse.' : 'Show problems.'}`}
      className="w-48 shrink-0 snap-start text-left"
    >
      <Card
        className={cn(
          'glow-card h-full overflow-hidden hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-1 ring-primary/30',
        )}
        data-selected={selected}
      >
        <CardContent className="flex h-full flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-base font-extrabold text-primary"
              aria-hidden
            >
              {pattern.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <CardTitle className="truncate text-sm">{pattern.name}</CardTitle>
              <span className="font-metric text-xs font-semibold text-primary">
                {pattern.problemCount.toLocaleString()}{' '}
                {pattern.problemCount === 1 ? 'problem' : 'problems'}
              </span>
            </span>
          </div>
          {pattern.topCategories.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {pattern.topCategories.slice(0, 2).map((category) => (
                <Badge key={category.slug} variant="outline" className="text-[11px]">
                  {category.name}
                </Badge>
              ))}
            </span>
          ) : null}
          <span className="mt-auto pt-0.5 text-[11px] text-muted-foreground">
            {pattern.difficultyBand}
            {selected ? ' · open' : ''}
          </span>
        </CardContent>
      </Card>
    </button>
  );
}

/**
 * Exam-pattern folders as inline expandable cards. Clicking a card reveals
 * its problems continuously below the row — the page never navigates away
 * (Explore is a separate, empty surface).
 */
export function ExamPatterns(): React.JSX.Element {
  const { data, isPending, isError, refetch } = useExamPatterns();
  const [openSlug, setOpenSlug] = React.useState<string | null>(null);

  const patterns = data ?? [];
  const open = patterns.find((pattern) => pattern.slug === openSlug) ?? null;

  return (
    <section aria-label="Exam patterns" className="space-y-4">
      <SectionHeader
        title="Exam Patterns"
        description="Tap a folder to read its problems right here — counts update as admins publish."
      />
      {isPending ? (
        <ExamPatternSkeletons />
      ) : isError ? (
        <ErrorState
          title="Could not load exam patterns"
          description="The catalog did not respond. Check your connection and try again."
          onRetry={() => void refetch()}
        />
      ) : patterns.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No exam folders yet"
          description="Folders appear here once exam tags hold published problems."
        />
      ) : (
        <div className="flex snap-x gap-2.5 overflow-x-auto px-0.5 pb-2 pt-2">
          {patterns.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              selected={pattern.slug === openSlug}
              onSelect={() =>
                setOpenSlug((current) => (current === pattern.slug ? null : pattern.slug))
              }
            />
          ))}
        </div>
      )}
      {open ? (
        <FolderProblems
          title={open.name}
          subtitle={`${open.problemCount.toLocaleString()} problems · ${open.difficultyBand}`}
          filter={{ exam: open.slug }}
          onClose={() => setOpenSlug(null)}
        />
      ) : null}
    </section>
  );
}
