'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  EmptyState,
  ErrorState,
  LoadingState,
  Progress,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { ApiError } from '@/lib/api-client';
import { useState } from 'react';
import { Input, Label } from '@apteez/ui';
import { ProfileName } from '@/components/profile/profile-link';
import {
  useEvent,
  useEventLeaderboard,
  useEventResult,
  useJoinEvent,
  useJoinOrganization,
  useRegisterEvent,
  useWithdrawEvent,
} from '@/hooks/use-events';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function EventDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { data: event, isLoading, isError, error, refetch } = useEvent(id);
  const showResults = event?.status === 'COMPLETED' || event?.phase === 'past';
  const { data: leaderboard } = useEventLeaderboard(showResults ? id : undefined, {
    page: 1,
    pageSize: 10,
  });
  // Own result as soon as this participant submitted — even while the event
  // is still live for others (contest-style: submit → see your score).
  const submitted = Boolean(
    event?.participant &&
      (event.participant.status === 'SUBMITTED' || event.participant.status === 'AUTO_SUBMITTED'),
  );
  const { data: ownResult } = useEventResult(submitted ? event?.id : undefined);
  const register = useRegisterEvent(event?.id);
  const withdraw = useWithdrawEvent(event?.id);
  const join = useJoinEvent(event?.id);
  const joinOrg = useJoinOrganization();
  const [code, setCode] = useState('');

  if (isLoading) {
    return <LoadingState title="Loading event…" />;
  }
  if (isError || !event) {
    return (
      <ErrorState
        description={error instanceof ApiError ? error.message : 'Event not found.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const capacityPct =
    event.maxParticipants !== null && event.maxParticipants > 0
      ? Math.min(100, Math.round((event.participantCount / event.maxParticipants) * 100))
      : null;
  const orgId = event.organization?.id ?? null;
  const orgName = event.organization?.name ?? null;

  const onRegister = (): void => {
    register.mutate(code.trim() ? { code: code.trim() } : {}, {
      onSuccess: () => {
        toast.success('Registered for this event.');
        setCode('');
        void refetch();
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Registration failed.'),
    });
  };
  const onWithdraw = (): void => {
    withdraw.mutate(undefined, {
      onSuccess: () => {
        toast.success('Registration withdrawn.');
        void refetch();
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Withdrawal failed.'),
    });
  };
  const onJoin = (): void => {
    join.mutate(code.trim() ? { code: code.trim() } : {}, {
      onSuccess: () => router.push(`/events/${event.slug}/live`),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not enter the event.'),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={event.title}
        description={`${event.eventType} · ${event.visibility} · ${event.difficulty}`}
        actions={
          event.canManage ? (
            <Link href={`/events/${event.slug}/manage`}>
              <Button variant="outline">Manage</Button>
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    event.phase === 'live'
                      ? 'success'
                      : event.phase === 'past'
                        ? 'secondary'
                        : 'warning'
                  }
                >
                  {event.status.replace(/_/g, ' ')}
                </Badge>
                {event.isOfficial ? <Badge variant="default">Official</Badge> : null}
                <Badge variant="outline">{event.eventType}</Badge>
                <Badge variant="outline">{event.visibility}</Badge>
                <Badge variant="outline">{event.difficulty}</Badge>
                {event.isPaid ? (
                  <Badge variant="warning">Paid-ready</Badge>
                ) : (
                  <Badge variant="success">Free</Badge>
                )}
              </div>
              <p className="whitespace-pre-line leading-relaxed">{event.description}</p>
              {event.rules ? (
                <div>
                  <h2 className="text-section-title mb-2">Rules</h2>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{event.rules}</p>
                </div>
              ) : null}
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">Starts: </span>
                  {formatDateTime(event.startsAt)}
                </div>
                <div>
                  <span className="text-muted-foreground">Ends: </span>
                  {formatDateTime(event.endsAt)}
                </div>
                <div>
                  <span className="text-muted-foreground">Duration: </span>
                  <span className="font-metric">{event.durationMinutes} min</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Questions: </span>
                  <span className="font-metric">{event.questionCount}</span>
                </div>
                {event.registrationEndAt ? (
                  <div>
                    <span className="text-muted-foreground">Registration closes: </span>
                    {formatDateTime(event.registrationEndAt)}
                  </div>
                ) : null}
                {event.organization ? (
                  <div>
                    <span className="text-muted-foreground">Organization: </span>
                    {event.organization.name}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
          {ownResult ? (
            <Card>
              <CardContent className="space-y-2 p-6">
                <CardTitle className="text-card-title">Your result</CardTitle>
                <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                  <span>
                    Score <span className="font-metric text-lg">{ownResult.score}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Correct <span className="font-metric">{ownResult.correctCount}</span> · Wrong{' '}
                    <span className="font-metric">{ownResult.wrongCount}</span> · Unanswered{' '}
                    <span className="font-metric">{ownResult.unansweredCount}</span>
                  </span>
                  <span className="text-muted-foreground">
                    Time <span className="font-metric">{ownResult.completionSeconds}s</span>
                  </span>
                  {ownResult.rank !== null ? (
                    <span>
                      Rank <span className="font-metric">#{ownResult.rank}</span> of{' '}
                      <span className="font-metric">{ownResult.totalParticipants}</span>
                    </span>
                  ) : null}
                  {ownResult.autoSubmitted ? (
                    <Badge variant="outline">Auto-submitted</Badge>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}
          {leaderboard && leaderboard.items.length > 0 ? (
            <Card>
              <CardContent className="space-y-3 p-6">
                <div className="flex items-baseline justify-between">
                  <CardTitle className="text-card-title">Results</CardTitle>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-metric">{leaderboard.meta.total}</span> participants
                  </span>
                </div>
                <ol className="space-y-2">
                  {leaderboard.items.map((row) => (
                    <li
                      key={row.userId}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-3 text-sm ${row.isCurrentUser ? 'border-primary/50 bg-primary/5' : 'border-border'}`}
                    >
                      <span className="min-w-0">
                        <span className="font-metric">#{row.rank}</span>{' '}
                        <ProfileName username={row.username} displayName={row.displayName} />
                        {row.institution ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {row.institution}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="font-metric">{row.score} pts</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-metric">{row.correctCount}</span>C ·{' '}
                          <span className="font-metric">{row.wrongCount}</span>W ·{' '}
                          <span className="font-metric">{row.completionSeconds}s</span>
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-card-title">Participation</CardTitle>
                <CardDescription>
                  <span className="font-metric">{event.participantCount}</span>
                  {event.maxParticipants !== null ? (
                    <span>
                      {' '}
                      / <span className="font-metric">{event.maxParticipants}</span>
                    </span>
                  ) : null}{' '}
                  joined
                </CardDescription>
              </div>
              {capacityPct !== null ? <Progress value={capacityPct} /> : null}
              {event.spotsLeft !== null ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-metric">{event.spotsLeft}</span> spots left
                </p>
              ) : null}
              {event.requiresCode && !event.participant ? (
                <div className="space-y-1.5">
                  <Label htmlFor="event-code">Entry code</Label>
                  <Input
                    id="event-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Ask the organizer for the code"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    This event needs a code — enter it to register.
                  </p>
                </div>
              ) : null}
              {event.visibility === 'UNIVERSITY' &&
              orgId &&
              orgName &&
              !event.organizationIsMember &&
              !event.participant ? (
                <div className="space-y-2 rounded-lg border border-border p-3">
                  <p className="text-sm">
                    Restricted to <span className="font-medium">{orgName}</span> members.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    disabled={joinOrg.isPending}
                    onClick={() =>
                      joinOrg.mutate(orgId, {
                        onSuccess: () => {
                          toast.success(`Joined ${orgName}.`);
                          void refetch();
                        },
                        onError: (e) =>
                          toast.error(
                            e instanceof ApiError ? e.message : 'Could not join the organization.',
                          ),
                      })
                    }
                  >
                    {joinOrg.isPending ? 'Joining…' : `Join ${orgName}`}
                  </Button>
                </div>
              ) : null}
              {event.participant ? (
                <div className="space-y-2 text-sm">
                  <Badge variant="outline">{event.participant.status}</Badge>
                  {event.participant.rank !== null ? (
                    <p>
                      Rank <span className="font-metric">#{event.participant.rank}</span>
                    </p>
                  ) : null}
                  {event.phase === 'live' || event.status === 'LIVE' ? (
                    <Button className="w-full" onClick={onJoin} disabled={join.isPending}>
                      Enter event
                    </Button>
                  ) : null}
                  {event.participant.status === 'REGISTERED' ? (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={onWithdraw}
                      disabled={withdraw.isPending}
                    >
                      Withdraw
                    </Button>
                  ) : null}
                </div>
              ) : event.canRegister ? (
                <Button className="w-full" onClick={onRegister} disabled={register.isPending}>
                  Register — free
                </Button>
              ) : (
                <EmptyState
                  title="Registration unavailable"
                  description={
                    event.registrationRestriction ?? 'You cannot register for this event right now.'
                  }
                />
              )}
              {event.status === 'CANCELLED' ? <Badge variant="destructive">Cancelled</Badge> : null}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-2 p-6 text-sm">
              <CardTitle className="text-card-title">Organizer</CardTitle>
              <p>{event.organizer.displayName}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
