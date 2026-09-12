'use client';

import { Clock, ListChecks, Timer, Users } from 'lucide-react';
import type { ContestSummaryDto } from '@apteez/types';
import { Badge, Button, Card, CardContent, CardDescription, CardTitle, cn } from '@apteez/ui';

export interface ContestCardProps {
  contest: ContestSummaryDto;
  onRegister?: (contestId: string) => void;
  onUnregister?: (contestId: string) => void;
  onEnter?: (contestId: string) => void;
  onView?: (contestId: string) => void;
  registrationPending?: boolean;
  className?: string;
}

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

function phaseLabel(contest: ContestSummaryDto): {
  label: string;
  variant: 'success' | 'warning' | 'secondary' | 'outline';
} {
  if (contest.phase === 'live') {
    return { label: 'Live', variant: 'success' };
  }
  if (contest.phase === 'upcoming') {
    return { label: 'Upcoming', variant: 'warning' };
  }
  return { label: 'Ended', variant: 'secondary' };
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Discovery card — lightweight summary fields only, never questions. */
export function ContestCard({
  contest,
  onRegister,
  onUnregister,
  onEnter,
  onView,
  registrationPending = false,
  className,
}: ContestCardProps): React.JSX.Element {
  const phase = phaseLabel(contest);
  const canEnterLive = contest.isRegistered && contest.phase !== 'past';
  return (
    <Card className={cn('transition-colors hover:border-primary/50', className)}>
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
          <Badge variant={DIFFICULTY_TONE[contest.difficulty]}>{contest.difficulty}</Badge>
          {canEnterLive ? (
            <Button size="sm" onClick={() => onEnter?.(contest.id)}>
              Enter contest
            </Button>
          ) : contest.isRegistered ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline">Registered</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onUnregister?.(contest.id)}
                disabled={registrationPending}
              >
                Unregister
              </Button>
            </div>
          ) : contest.registrationOpen ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRegister?.(contest.id)}
              disabled={registrationPending}
            >
              Register
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onView?.(contest.id)}>
              Details
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
