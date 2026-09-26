'use client';

import Link from 'next/link';
import { Clock, ListChecks, Timer, Users } from 'lucide-react';
import type { EventSummaryDto } from '@apteez/types';
import { Badge, Card, CardContent, CardDescription, CardTitle, cn } from '@apteez/ui';

export interface EventCardProps {
  event: EventSummaryDto;
  className?: string;
}

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

function phaseBadge(event: EventSummaryDto): {
  label: string;
  variant: 'success' | 'warning' | 'secondary' | 'outline';
} {
  if (event.phase === 'live') {
    return { label: 'Live', variant: 'success' };
  }
  if (event.phase === 'past') {
    return { label: 'Ended', variant: 'secondary' };
  }
  if (event.status === 'REGISTRATION_OPEN') {
    return { label: 'Registration open', variant: 'success' };
  }
  if (event.status === 'CANCELLED') {
    return { label: 'Cancelled', variant: 'outline' };
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
 * questions. Follows contest-card idiom.
 */
export function EventCard({ event, className }: EventCardProps): React.JSX.Element {
  const phase = phaseBadge(event);
  const action = event.isRegistered
    ? event.phase === 'live'
      ? 'Enter'
      : 'Registered'
    : event.registrationOpen
      ? 'Register'
      : 'Details';
  return (
    <Link
      href={`/events/${event.slug}`}
      className="block h-full"
      aria-label={`${event.title} — ${action}`}
    >
      <Card
        className={cn(
          'h-full cursor-pointer transition-colors hover:border-primary/50 hover:shadow-sm',
          className,
        )}
      >
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-card-title">{event.title}</CardTitle>
            <Badge variant={phase.variant}>{phase.label}</Badge>
          </div>
          {event.description ? (
            <CardDescription className="line-clamp-2">{event.description}</CardDescription>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={event.isOfficial ? 'default' : 'secondary'}>
              {event.isOfficial ? 'Official' : 'Community'}
            </Badge>
            <Badge variant="outline">{event.eventType}</Badge>
            <Badge variant="outline">{event.visibility}</Badge>
            {event.isPaid ? (
              <Badge variant="warning">Paid-ready</Badge>
            ) : (
              <Badge variant="success">Free</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Timer className="size-4" aria-hidden />
              {event.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="size-4" aria-hidden />
              <span className="font-metric">{event.questionCount}</span> questions
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              <span className="font-metric">{event.participantCount}</span>
              {event.maxParticipants !== null ? (
                <span>
                  / <span className="font-metric">{event.maxParticipants}</span>
                </span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" aria-hidden />
              {formatDateTime(event.startsAt)}
            </span>
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <Badge variant={DIFFICULTY_TONE[event.difficulty]}>{event.difficulty}</Badge>
            <span className="text-sm font-medium text-primary">{action} →</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
