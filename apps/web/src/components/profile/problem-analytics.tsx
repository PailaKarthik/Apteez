'use client';

import type { DifficultyPerformanceDto, PerformanceOverallDto } from '@apteez/types';
import { Card, CardContent, CardTitle, ProgressRing, Skeleton, cn } from '@apteez/ui';

const BAND_TONE: Record<'EASY' | 'MEDIUM' | 'HARD', string> = {
  EASY: 'bg-success',
  MEDIUM: 'bg-warning',
  HARD: 'bg-destructive',
};

const BAND_LABEL: Record<'EASY' | 'MEDIUM' | 'HARD', string> = {
  EASY: 'Easy',
  MEDIUM: 'Med.',
  HARD: 'Hard',
};

/**
 * LeetCode-style problem analytics: solved-vs-library ring, attempted /
 * right / wrong totals, and per-difficulty solved bars. All numbers come
 * from authoritative submissions — never client-computed.
 */
export function ProblemAnalytics({
  overall,
  difficulties,
  isLoading,
}: {
  overall: PerformanceOverallDto | undefined;
  difficulties: DifficultyPerformanceDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading || !overall) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-48" />
          <div className="flex items-center gap-4">
            <Skeleton className="size-28 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const solved = overall.distinctSolved;
  const total = overall.totalProblems;
  const attempted = overall.totalAttempted;
  const right = overall.totalSolved;
  const wrong = Math.max(0, attempted - right);
  const solvedPct = total === 0 ? 0 : Math.min(100, Math.round((solved / total) * 100));
  const byDifficulty = new Map((difficulties ?? []).map((d) => [d.difficulty, d]));

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-card-title">Problems solved</CardTitle>
          {overall.accuracy !== null ? (
            <span className="text-sm text-muted-foreground">
              <span className="font-metric">{overall.accuracy}%</span> acceptance
            </span>
          ) : null}
        </div>
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <div className="relative shrink-0">
            <ProgressRing value={solvedPct} size={120} strokeWidth={11} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-metric text-2xl font-bold text-foreground">{solved}</span>
              <span className="text-xs text-muted-foreground">Solved</span>
            </div>
          </div>
          <div className="w-full min-w-0 flex-1 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                <p className="font-metric text-lg font-bold text-foreground">{total}</p>
                <p className="text-[11px] text-muted-foreground">Total problems</p>
              </div>
              <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                <p className="font-metric text-lg font-bold text-foreground">{attempted}</p>
                <p className="text-[11px] text-muted-foreground">Attempted</p>
              </div>
              <div className="rounded-xl bg-muted/60 px-2 py-2.5">
                <p className="font-metric text-lg font-bold text-foreground">
                  <span className="text-success">{right}</span>
                  <span className="text-muted-foreground"> / </span>
                  <span className="text-destructive">{wrong}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">Right / Wrong</p>
              </div>
            </div>
            <ul className="space-y-2">
              {(['EASY', 'MEDIUM', 'HARD'] as const).map((band) => {
                const row = byDifficulty.get(band);
                const bandSolved = row?.solved ?? 0;
                const bandAttempts = row?.attempts ?? 0;
                const pct =
                  bandAttempts === 0 ? 0 : Math.min(100, Math.round((bandSolved / bandAttempts) * 100));
                return (
                  <li key={band} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-xs font-medium text-muted-foreground">
                      {BAND_LABEL[band]}
                    </span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className={cn('block h-full rounded-full', BAND_TONE[band])}
                        style={{ width: `${pct}%` }}
                      />
                    </span>
                    <span className="w-20 shrink-0 text-right font-metric text-xs text-muted-foreground">
                      {bandSolved}/{bandAttempts === 0 ? '—' : bandAttempts}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
