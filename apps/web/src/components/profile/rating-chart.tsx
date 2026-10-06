'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import type { RatingPointDto } from '@apteez/types';
import { Card, CardContent, CardTitle, Skeleton } from '@apteez/ui';

type SeriesRow = { label: string; challenge?: number; contest?: number };

const Chart = dynamic(
  async () => {
    const recharts = await import('recharts');
    return function RatingArea({ data }: { data: SeriesRow[] }) {
      return (
        <recharts.ResponsiveContainer width="100%" height={220}>
          <recharts.AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <recharts.XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
            />
            <recharts.YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <recharts.Tooltip
              contentStyle={{ borderRadius: 12, fontSize: 12 }}
              wrapperStyle={{ maxWidth: '90vw' }}
              labelFormatter={(label: string) => label}
            />
            <recharts.Area
              type="monotone"
              dataKey="challenge"
              name="Challenge"
              connectNulls
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary) / 0.18)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <recharts.Area
              type="monotone"
              dataKey="contest"
              name="Contest"
              connectNulls
              stroke="hsl(var(--success))"
              fill="hsl(var(--success) / 0.15)"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </recharts.AreaChart>
        </recharts.ResponsiveContainer>
      );
    };
  },
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> },
);

/**
 * Dual rating curves from unified engine history: challenge (primary) and
 * contest (green). Each series forward-fills so one engine going quiet never
 * drags the other's line. Empty-safe. A single rated game already renders
 * (dots mark lone points) — previously the first-ever rating showed the
 * empty placeholder, which read as "ratings are broken".
 */
export function RatingChart({
  points,
  isLoading,
}: {
  points: RatingPointDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  const { data, hasChallenge, hasContest } = useMemo(() => {
    if (!points || points.length === 0) {
      return { data: [], hasChallenge: false, hasContest: false };
    }
    const ordered = [...points].sort((a, b) => (a.date < b.date ? -1 : 1));
    const rows: SeriesRow[] = [];
    let challenge: number | undefined;
    let contest: number | undefined;
    for (const point of ordered) {
      if (point.source === 'challenge') {
        challenge = point.after;
      } else {
        contest = point.after;
      }
      rows.push({
        label: new Date(point.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        ...(challenge !== undefined ? { challenge } : {}),
        ...(contest !== undefined ? { contest } : {}),
      });
    }
    return {
      data: rows,
      hasChallenge: challenge !== undefined,
      hasContest: contest !== undefined,
    };
  }, [points]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-[220px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-card-title">Rating history</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {hasChallenge ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-primary" />
                Challenge
              </span>
            ) : null}
            {hasContest ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full bg-success" />
                Contest
              </span>
            ) : null}
          </div>
        </div>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Play rated challenges or contests — your rating curve appears here.
          </p>
        ) : (
          <Chart data={data} />
        )}
      </CardContent>
    </Card>
  );
}
