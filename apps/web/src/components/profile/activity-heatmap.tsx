'use client';

import { useMemo } from 'react';
import type { ActivityDayDto } from '@apteez/types';
import { Card, CardContent, CardTitle, Skeleton, cn } from '@apteez/ui';

/** GitHub-style intensity bucket from a daily count. Pure — unit-tested. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) {
    return 0;
  }
  if (count <= 2) {
    return 1;
  }
  if (count <= 4) {
    return 2;
  }
  if (count <= 7) {
    return 3;
  }
  return 4;
}

const LEVEL_CLASS: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-muted',
  1: 'bg-success/25',
  2: 'bg-success/50',
  3: 'bg-success/75',
  4: 'bg-success',
};

export function ActivityHeatmap({
  days,
  isLoading,
}: {
  days: ActivityDayDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  const weeks = useMemo(() => {
    if (!days || days.length === 0) {
      return [];
    }
    const columns: ActivityDayDto[][] = [];
    let current: ActivityDayDto[] = [];
    // Align the first column to start on Monday for a stable grid.
    const firstWeekday = (new Date(`${days[0].date}T00:00:00Z`).getUTCDay() + 6) % 7;
    for (let pad = 0; pad < firstWeekday; pad += 1) {
      current.push({ date: `pad-${pad}`, count: -1, solved: 0, attempted: 0 });
    }
    for (const day of days) {
      current.push(day);
      if (current.length === 7) {
        columns.push(current);
        current = [];
      }
    }
    if (current.length > 0) {
      columns.push(current);
    }
    return columns;
  }, [days]);

  const totalAttempted = useMemo(
    () => (days ?? []).reduce((sum, day) => sum + (day.attempted ?? 0), 0),
    [days],
  );
  const totalSolved = useMemo(
    () => (days ?? []).reduce((sum, day) => sum + day.solved, 0),
    [days],
  );

  // Month label per column: shown when the column holds the 1st of a month.
  const monthLabels = useMemo(
    () =>
      weeks.map((week) => {
        const first = week.find((day) => day.count >= 0 && day.date.slice(8) === '01');
        if (!first) {
          return '';
        }
        return new Date(`${first.date}T00:00:00Z`).toLocaleString(undefined, {
          month: 'short',
          timeZone: 'UTC',
        });
      }),
    [weeks],
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-card-title">Activity</CardTitle>
          <span className="text-sm text-muted-foreground">
            <span className="font-metric">{totalAttempted}</span> attempts ·{' '}
            <span className="font-metric">{totalSolved}</span> solved
          </span>
        </div>
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet — solving problems, playing challenges and joining events fills this in.
          </p>
        ) : (
          <div
            className="flex gap-1 overflow-x-auto pb-1"
            role="img"
            aria-label={`Activity heatmap, ${totalAttempted} attempts, ${totalSolved} solved`}
          >
            {weeks.map((week, column) => (
              <div key={column} className="flex flex-col gap-1">
                <span className="h-4 w-3 truncate text-[10px] leading-4 text-muted-foreground">
                  {monthLabels[column]}
                </span>
                {week.map((day) =>
                  day.count < 0 ? (
                    <span key={day.date} className="size-3 rounded-[3px] bg-transparent" />
                  ) : (
                    <span
                      key={day.date}
                      title={`${day.date}: ${day.attempted ?? 0} attempts, ${day.solved} solved`}
                      className={cn('size-3 rounded-[3px]', LEVEL_CLASS[heatLevel(day.count)])}
                    />
                  ),
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
          Less
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span key={level} className={cn('size-3 rounded-[3px]', LEVEL_CLASS[level])} />
          ))}
          More
        </div>
      </CardContent>
    </Card>
  );
}
