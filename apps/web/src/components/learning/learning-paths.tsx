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
  LoadingState,
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

function LearningPathCard({ path }: { path: LearningPathSummaryDto }): React.JSX.Element {
  const Icon = PATH_ICONS[path.icon ?? 'book'] ?? BookOpen;
  const minutesLabel = formatMinutes(path.estimatedMinutes);
  return (
    <Card className="transition-colors duration-fast hover:border-primary/50">
      <CardHeader className="gap-2.5 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-elevated text-primary">
            <Icon className="size-5" aria-hidden />
          </span>
          {path.accessLevel === 'PREMIUM' ? <Badge variant="secondary">Premium</Badge> : null}
        </div>
        <CardTitle className="text-card-title">{path.title}</CardTitle>
        <CardDescription>{path.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-5 pt-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {path.topicCount} topic{path.topicCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>
            {path.lessonCount} lesson{path.lessonCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden>·</span>
          <span>{minutesLabel}</span>
        </div>
        {path.progress ? (
          <div className="space-y-1.5" aria-label={`${path.progress.completedPercent}% complete`}>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {path.progress.completedLessons} / {path.lessonCount} completed
              </span>
              <span className="font-metric">{path.progress.completedPercent}%</span>
            </div>
            <Progress value={path.progress.completedPercent} />
          </div>
        ) : null}
        <Button asChild variant="outline" className="mt-1">
          <Link href={`/learn/${path.slug}`}>Open path</Link>
        </Button>
      </CardContent>
    </Card>
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
    return <LoadingState title="Loading learning paths…" />;
  }
  if (paths.isError) {
    return (
      <ErrorState title="Could not load learning paths" onRetry={() => void paths.refetch()} />
    );
  }

  const items = paths.data ?? [];
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No learning paths are available yet — check back soon.
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      {isAuthenticated && user ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Studying as <span className="font-medium text-foreground">{user.displayName}</span> —
          progress below reflects your coursework.
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((path) => (
          <LearningPathCard key={path.id} path={path} />
        ))}
      </div>
    </div>
  );
}
