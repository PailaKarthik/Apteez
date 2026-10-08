'use client';

import * as React from 'react';
import { Badge, Card, CardContent, CardTitle, EmptyState, ErrorState, cn } from '@apteez/ui';
import { FolderOpen } from 'lucide-react';
import { SectionHeader } from '@apteez/ui';
import type { ExamPatternDto } from '@apteez/types';
import { useExamPatterns } from '@/hooks/use-home';
import { usePrefetchProblemsFeed } from '@/hooks/use-problems';
import { FolderProblems } from './folder-problems';

function ExamPatternSkeletons(): React.JSX.Element {
  return (
    <div
      className="flex snap-x gap-3 overflow-x-auto pb-2"
      aria-busy="true"
      aria-label="Loading exam patterns"
      aria-hidden
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Card
          key={index}
          className="w-52 shrink-0 animate-fade-up overflow-hidden"
          style={{ animationDelay: `${index * 70}ms` }}
        >
          <CardContent className="space-y-2.5 p-4">
            <div className="flex items-center gap-2.5">
              <div className="skeleton-shine size-10 rounded-xl" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton-shine h-4 w-20 rounded-md" />
                <div className="skeleton-shine h-3 w-24 rounded-md" />
              </div>
            </div>
            <div className="flex gap-1.5">
              <div className="skeleton-shine h-5 w-14 rounded-full" />
              <div className="skeleton-shine h-5 w-14 rounded-full" />
            </div>
            <div className="loading-rail h-1" aria-hidden>
              <span />
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
      className="group w-52 shrink-0 snap-start text-left"
    >
      <Card
        className={cn(
          'card-lift card-shine glow-card h-full overflow-hidden focus-visible:ring-2 focus-visible:ring-ring',
          selected && 'ring-1 ring-primary/40',
        )}
        data-selected={selected}
      >
        <span
          className="block h-1 bg-gradient-to-r from-primary to-accent-foreground opacity-70 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
        <CardContent className="flex h-full flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2.5">
            <span className="icon-tile size-10 shrink-0 text-lg font-extrabold" aria-hidden>
              {pattern.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <CardTitle className="truncate text-sm transition-colors group-hover:text-primary">
                {pattern.name}
              </CardTitle>
              <span className="gradient-text-cool font-metric text-xs font-bold">
                {pattern.problemCount.toLocaleString()}{' '}
                {pattern.problemCount === 1 ? 'problem' : 'problems'}
              </span>
            </span>
          </div>
          {pattern.topCategories.length > 0 ? (
            <span className="flex flex-wrap gap-1">
              {pattern.topCategories.slice(0, 2).map((category) => (
                <Badge
                  key={category.slug}
                  variant="outline"
                  className="text-[11px] transition-colors group-hover:border-primary/40"
                >
                  {category.name}
                </Badge>
              ))}
            </span>
          ) : null}
          <span className="mt-auto flex items-center justify-between pt-0.5 text-[11px] text-muted-foreground">
            {pattern.difficultyBand}
            <span
              className={cn(
                'font-semibold transition-all group-hover:translate-x-0.5 group-hover:text-primary',
                selected ? 'text-primary' : 'opacity-0 group-hover:opacity-100',
              )}
              aria-hidden
            >
              {selected ? '● open' : '→'}
            </span>
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
        <div className="fade-x scrollbar-hide -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-3 pt-2">
          {patterns.map((pattern, index) => (
            <div
              key={pattern.id}
              className="animate-fade-up shrink-0"
              style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
            >
              <PatternCard
                pattern={pattern}
                selected={pattern.slug === openSlug}
                onSelect={() =>
                  setOpenSlug((current) => (current === pattern.slug ? null : pattern.slug))
                }
              />
            </div>
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
