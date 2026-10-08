'use client';

import Link from 'next/link';
import { ArrowRight, Clock, ListChecks, Timer, Users } from 'lucide-react';
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
 * questions. Mirrors the contest-card treatment: top strip, lift + shine,
 * live pulse.
 */
export function EventCard({ event, className }: EventCardProps): React.JSX.Element {
  const phase = phaseBadge(event);
  const isLive = event.phase === 'live';
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
      className="group block h-full"
      aria-label={`${event.title} — ${action}`}
    >
      <Card
        className={cn(
          'card-lift card-shine h-full cursor-pointer overflow-hidden',
          isLive && 'border-success/40 shadow-[0_0_32px_-10px_hsl(var(--success)/0.5)]',
          className,
        )}
      >
        <span
          className={cn(
            'block h-1 bg-gradient-to-r',
            isLive
              ? 'from-success to-success/50'
              : event.phase === 'past'
                ? 'from-muted-foreground/30 to-muted-foreground/10'
                : 'from-primary to-accent-foreground',
          )}
          aria-hidden
        />
        <CardContent className="flex h-full flex-col gap-3 p-5">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="min-w-0 flex-1 break-words text-card-title transition-colors group-hover:text-primary">
              {event.title}
            </CardTitle>
            <Badge variant={phase.variant} className="flex shrink-0 items-center gap-1.5">
              {isLive ? <span className="live-dot" aria-hidden /> : null}
              {phase.label}
            </Badge>
          </div>
          {event.description ? (
            <CardDescription className="line-clamp-2">{event.description}</CardDescription>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {event.isOfficial ? <Badge variant="default">Official</Badge> : null}
            <Badge variant="outline">{event.eventType}</Badge>
            <Badge variant="outline">{event.visibility}</Badge>
            {event.isPaid ? (
              <Badge variant="warning">Paid-ready</Badge>
            ) : (
              <Badge variant="success">Free</Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1 transition-colors group-hover:bg-primary/10">
              <Timer className="size-4 text-primary" aria-hidden />
              {event.durationMinutes} min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListChecks className="size-4" aria-hidden />
              <span className="font-metric font-semibold text-foreground">{event.questionCount}</span> questions
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
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-all group-hover:gap-2">
              {action}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
