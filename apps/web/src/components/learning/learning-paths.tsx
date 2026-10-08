'use client';

import Link from 'next/link';
import {
  BarChart3,
  BookOpen,
  Calculator,
  Gamepad2,
  KeyRound,
  Puzzle,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import type { LearningPathSummaryDto } from '@apteez/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Progress,
} from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useLearningPaths } from '@/hooks/use-learning';

const PATH_ICONS: Record<string, LucideIcon> = {
  calculator: Calculator,
  puzzle: Puzzle,
  book: BookOpen,
  chart: BarChart3,
  shapes: Shapes,
  gamepad: Gamepad2,
  key: KeyRound,
};

function formatMinutes(minutes: number): string {
  if (minutes < 1) {
    return 'Coming soon';
  }
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`;
}

function LearningPathCard({ path, index = 0 }: { path: LearningPathSummaryDto; index?: number }): React.JSX.Element {
  const Icon = PATH_ICONS[path.icon ?? 'book'] ?? BookOpen;
  const minutesLabel = formatMinutes(path.estimatedMinutes);
  const complete = (path.progress?.completedPercent ?? 0) >= 100;
  return (
    <div className="animate-fade-up h-full" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <Card className="card-lift card-shine group h-full overflow-hidden">
        <span className="block h-1 bg-gradient-to-r from-primary to-accent-foreground opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
        <CardHeader className="gap-2.5 p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="icon-tile size-11" aria-hidden>
              <Icon className="size-5" />
            </span>
            {path.accessLevel === 'PREMIUM' ? (
              <Badge variant="secondary" className="border-gold/40 bg-gold/10 text-gold">Premium</Badge>
            ) : null}
          </div>
          <CardTitle className="text-card-title transition-colors group-hover:text-primary">{path.title}</CardTitle>
          <CardDescription className="line-clamp-2">{path.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-metric font-semibold text-foreground">{path.topicCount}</span>
            <span>topic{path.topicCount === 1 ? '' : 's'}</span>
            <span aria-hidden>·</span>
            <span className="font-metric font-semibold text-foreground">{path.lessonCount}</span>
            <span>lesson{path.lessonCount === 1 ? '' : 's'}</span>
            <span aria-hidden>·</span>
            <span>{minutesLabel}</span>
          </div>
          {path.progress ? (
            <div className="space-y-1.5" aria-label={`${path.progress.completedPercent}% complete`}>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  {path.progress.completedLessons} / {path.lessonCount} completed
                </span>
                <span className="font-metric font-bold text-primary">{path.progress.completedPercent}%</span>
              </div>
              <Progress value={path.progress.completedPercent} size="sm" tone={complete ? 'success' : 'brand'} />
            </div>
          ) : null}
          <Button asChild variant="outline" className="mt-auto transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md group-hover:shadow-primary/15">
            <Link href={`/learn/${path.slug}`}>Open path →</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Explore grid of learning domains. Query-level auth decides whether progress
 * is shown; the grid itself stays identical for guests and signed-in users.
 */
export function LearningPaths(): React.JSX.Element {
  const { isAuthenticated, user } = useAuth();
  const paths = useLearningPaths();

  if (paths.isPending) {
    return (
      <div>
        <div className="loading-rail mb-4 h-1" aria-hidden>
          <span />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading learning paths">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} className="animate-fade-up overflow-hidden" style={{ animationDelay: `${i * 70}ms` }} aria-hidden>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between">
                  <div className="skeleton-shine size-11 rounded-xl" />
                  <div className="skeleton-shine h-5 w-16 rounded-full" />
                </div>
                <div className="skeleton-shine h-5 w-2/3 rounded-md" />
                <div className="skeleton-shine h-3 w-full rounded-md" />
                <div className="skeleton-shine h-3 w-4/5 rounded-md" />
                <div className="skeleton-shine h-9 w-full rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }
  if (paths.isError) {
    return (
      <ErrorState title="Could not load learning paths" onRetry={() => void paths.refetch()} />
    );
  }

  const items = paths.data ?? [];
  if (items.length === 0) {
    return (
      <Card className="animate-scale-in border-dashed border-primary/30 bg-primary/[0.03]">
        <CardContent className="space-y-2 p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10" aria-hidden>
            <BookOpen className="size-6 text-primary" />
          </span>
          <p className="text-sm font-semibold text-foreground">No learning paths yet</p>
          <p className="text-sm text-muted-foreground">
            No learning paths are available yet — check back soon.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {isAuthenticated && user ? (
        <p className="page-enter mb-4 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/[0.06] px-3 py-1 text-sm text-muted-foreground">
          Studying as <span className="font-semibold text-primary">{user.displayName}</span> —
          progress below reflects your coursework.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((path, index) => (
          <LearningPathCard key={path.id} path={path} index={index} />
        ))}
      </div>
    </div>
  );
}
