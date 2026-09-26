'use client';

import type {
  DifficultyPerformanceDto,
  DomainPerformanceDto,
  TopicPerformanceDto,
} from '@apteez/types';
import { Badge, Card, CardContent, CardTitle, Skeleton } from '@apteez/ui';

function AccuracyBar({ value }: { value: number | null }): React.JSX.Element {
  const pct = value ?? 0;
  return (
    <span className="flex min-w-28 items-center gap-2">
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </span>
      <span className="w-12 text-right font-metric text-sm">
        {value === null ? '—' : `${value}%`}
      </span>
    </span>
  );
}

function Trend({ value }: { value: number | null }): React.JSX.Element | null {
  if (value === null) {
    return null;
  }
  if (value > 0) {
    return <Badge variant="success">+{value} pts</Badge>;
  }
  if (value < 0) {
    return <Badge variant="destructive">{value} pts</Badge>;
  }
  return <Badge variant="outline">steady</Badge>;
}

function formatTime(seconds: number | null): string {
  if (seconds === null) {
    return '—';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function DomainPerformance({
  items,
  isLoading,
}: {
  items: DomainPerformanceDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <CardTitle className="text-card-title">By domain</CardTitle>
          <p className="text-sm text-muted-foreground">
            Solve problems to unlock domain analytics.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <CardTitle className="text-card-title">By domain</CardTitle>
        <ul className="divide-y divide-border">
          {items.map((row) => (
            <li key={row.domainSlug} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <span className="min-w-40 flex-1 text-sm font-medium">{row.domainName}</span>
              <span className="text-xs text-muted-foreground">
                <span className="font-metric">{row.solved}</span>/
                <span className="font-metric">{row.attempts}</span>
              </span>
              <AccuracyBar value={row.accuracy} />
              <span className="hidden text-xs text-muted-foreground sm:inline">
                avg <span className="font-metric">{formatTime(row.avgTimeSeconds)}</span>
              </span>
              <Trend value={row.recentTrend} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function DifficultyPerformance({
  items,
  isLoading,
}: {
  items: DifficultyPerformanceDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading || !items) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <CardTitle className="text-card-title">By difficulty</CardTitle>
          <p className="text-sm text-muted-foreground">No attempts yet.</p>
        </CardContent>
      </Card>
    );
  }
  const tone = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <CardTitle className="text-card-title">By difficulty</CardTitle>
        <ul className="space-y-2.5">
          {items.map((row) => (
            <li key={row.difficulty} className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Badge variant={tone[row.difficulty]}>{row.difficulty}</Badge>
              <span className="text-xs text-muted-foreground">
                <span className="font-metric">{row.solved}</span>/
                <span className="font-metric">{row.attempts}</span>
              </span>
              <AccuracyBar value={row.accuracy} />
              <Trend value={row.recentTrend} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function TopicPerformance({
  items,
  isLoading,
}: {
  items: TopicPerformanceDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }
  const top = (items ?? []).slice(0, 8);
  if (top.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-2 p-6">
          <CardTitle className="text-card-title">By topic</CardTitle>
          <p className="text-sm text-muted-foreground">No topic data yet.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <CardTitle className="text-card-title">By topic</CardTitle>
        <ul className="divide-y divide-border">
          {top.map((row) => (
            <li key={row.topicSlug} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <span className="min-w-40 flex-1">
                <span className="block text-sm font-medium">{row.topicName}</span>
                <span className="block text-xs text-muted-foreground">{row.domainName}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-metric">{row.attempts}</span> attempts
              </span>
              <AccuracyBar value={row.accuracy} />
              <Trend value={row.recentTrend} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
