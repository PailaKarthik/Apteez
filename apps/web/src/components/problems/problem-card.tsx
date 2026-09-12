import { Bookmark, Check, Image as ImageIcon, Sparkles } from 'lucide-react';
import Link from 'next/link';
import type { ProblemSummaryDto } from '@apteez/types';
import { Badge, Card, CardContent, ProgressRing, cn } from '@apteez/ui';

const DIFFICULTY_TONE = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'destructive',
} as const;

const DIFFICULTY_LABEL = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
} as const;

export interface ProblemCardProps {
  problem: ProblemSummaryDto;
  className?: string;
}

/**
 * Problem list/card projection. Shows the metadata the Figma list exposes
 * (topic, rating, accuracy, difficulty) plus solved and favourited state
 * for authenticated callers.
 */
export function ProblemCard({ problem, className }: ProblemCardProps): React.JSX.Element {
  return (
    <Link href={`/problems/${problem.id}`} className={cn('group block', className)}>
      <Card className="h-full transition-colors duration-fast group-hover:border-primary/50 group-hover:shadow-md">
        <CardContent className="flex h-full flex-col gap-3 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                {problem.category.name}
                {problem.topic ? ` · ${problem.topic.name}` : ''}
              </p>
              <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
                {problem.title}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {problem.isFavorited ? (
                <Bookmark className="size-4 text-gold" aria-label="Favorited" />
              ) : null}
              {problem.isSolved ? (
                <span className="flex size-5 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="size-3" aria-label="Solved" />
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={DIFFICULTY_TONE[problem.difficulty]}>
                {DIFFICULTY_LABEL[problem.difficulty]}
              </Badge>
              {problem.hasImage ? (
                <Badge variant="outline" aria-label="Has image content">
                  <ImageIcon className="size-3" aria-hidden />
                  Image
                </Badge>
              ) : null}
              {problem.hasShortcut ? (
                <Badge variant="outline" aria-label="Shortcut available">
                  <Sparkles className="size-3" aria-hidden />
                  Shortcut
                </Badge>
              ) : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="font-metric text-sm font-semibold text-foreground">
                  {problem.rating}
                </p>
                <p className="text-[10px] uppercase tracking-wide text-subtle-foreground">Rating</p>
              </div>
              {problem.accuracy !== null ? (
                <div className="flex items-center gap-1.5">
                  <ProgressRing value={problem.accuracy} size={32} strokeWidth={4} />
                  <div>
                    <p className="font-metric text-sm font-semibold text-foreground">
                      {problem.accuracy}%
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-subtle-foreground">
                      Accuracy
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
