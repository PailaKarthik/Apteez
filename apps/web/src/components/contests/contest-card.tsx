'use client';

import Link from 'next/link';
import { Clock, ListChecks, Timer, Users } from 'lucide-react';
import type { ContestSummaryDto } from '@apteez/types';
import { Badge, Card, CardContent, CardDescription, CardTitle, cn } from '@apteez/ui';

export interface ContestCardProps {
  contest: ContestSummaryDto;
  className?: string;
}

function phaseBadge(contest: ContestSummaryDto): {
  label: string;
  variant: 'success' | 'warning' | 'secondary' | 'outline';
} {
  if (contest.phase === 'live') {
    return { label: 'Live', variant: 'success' };
  }
  if (contest.phase === 'past') {
    return { label: 'Ended', variant: 'secondary' };
  }
  if (contest.status === 'CANCELLED') {
    return { label: 'Cancelled', variant: 'outline' };
  }
  if (contest.registrationOpen) {
    return { label: 'Registration open', variant: 'success' };
  }
  return { label: 'Upcoming', variant: 'warning' };
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Discovery card — the whole card is one link. Summary fields only, never
 * questions or correctness.
 */
export function ContestCard({ contest, className }: ContestCardProps): React.JSX.Element {
  const phase = phaseBadge(contest);
  const action = contest.isRegistered
    ? contest.phase === 'live'
      ? 'Enter'
      : 'Registered'
    : contest.registrationOpen
      ? 'Register'
      : 'Details';
  return (
    <Link
      href={`/contests/${contest.id}`}
      className="block h-full"
      aria-label={`${contest.name} — ${action}`}
    >
      <Card
        className={cn(
          'h-full cursor-pointer transition-colors hover:border-primary/50 hover:shadow-sm',
          className,
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-card-title">{contest.name}</CardTitle>
            <Badge variant={phase.variant}>{phase.label}</Badge>
          </div>
          {contest.description ? (
            <CardDescription className="line-clamp-2">{contest.description}</CardDescription>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-4" aria-hidden />
              {contest.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="size-4" aria-hidden />
              <span className="font-metric">{contest.questionCount}</span> questions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              <span className="font-metric">{contest.participantCount}</span>
              {contest.maxParticipants !== null ? (
                <span>
                  / <span className="font-metric">{contest.maxParticipants}</span>
                </span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {formatDateTime(contest.startsAt)}
            </span>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <Badge variant="outline" title="Every contest mixes easy, medium and hard problems">
              Mixed levels
            </Badge>
            <span className="text-sm font-medium text-primary">{action} →</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
