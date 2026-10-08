'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
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
  Progress,
} from '@apteez/ui';
import * as React from 'react';
import { CalendarClock, ListChecks, Settings2, Timer, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { ApiError } from '@/lib/api-client';
import { useAdminAccess } from '@/hooks/use-admin';
import { ProfileName } from '@/components/profile/profile-link';
import { useAuth } from '@/hooks/use-auth';
import {
  useContest,
  useContestLeaderboard,
  useContestResult,
  useRegisterContest,
  useStartContest,
  useUnregisterContest,
} from '@/hooks/use-contests';

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

function splitCountdown(targetMs: number, now: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor((targetMs - now) / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

/**
 * Live countdown hero: ticks every second toward the start (upcoming) or
 * the end (live), with capacity alongside. Pure display — the server owns
 * every gate.
 */
function ContestCountdownHero({
  phase,
  startsAt,
  endsAt,
  participantCount,
  maxParticipants,
  capacityPct,
}: {
  phase: 'live' | 'upcoming' | 'past';
  startsAt: string;
  endsAt: string;
  participantCount: number;
  maxParticipants: number | null;
  capacityPct: number | null;
}): React.JSX.Element {
  const now = useNow();
  const target = phase === 'live' ? new Date(endsAt).getTime() : new Date(startsAt).getTime();
  const { d, h, m, s } = splitCountdown(target, now);
  const label = phase === 'live' ? 'Ends in' : phase === 'upcoming' ? 'Starts in' : 'Ended';
  const units = [
    { value: d, label: 'days' },
    { value: h, label: 'hrs' },
    { value: m, label: 'min' },
    { value: s, label: 'sec' },
  ];
  return (
    <div className="page-enter-1 relative overflow-hidden rounded-3xl border border-border">
      <div
        className={
          phase === 'live'
            ? 'absolute inset-0 bg-gradient-to-br from-success/[0.12] via-card to-card'
            : 'absolute inset-0 bg-gradient-to-br from-primary/[0.13] via-card to-card'
        }
        aria-hidden
      />
      <div className="aurora-field" aria-hidden>
        <span
          className={
            phase === 'live'
              ? 'aurora-orb -left-12 -top-20 size-60 bg-success/20'
              : 'aurora-orb -left-12 -top-20 size-60 bg-primary/25'
          }
        />
        <span className="aurora-orb right-[10%] top-[-50%] size-52 bg-primary/15 [animation-delay:-6s]" />
      </div>
      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-metadata uppercase tracking-[0.18em] text-primary">
            {phase === 'live' ? <span className="live-dot" aria-hidden /> : null}
            {label}
          </p>
          {phase === 'past' ? (
            <p className="font-metric text-3xl font-extrabold text-foreground">Results are final</p>
          ) : (
            <div className="flex gap-2" role="timer" aria-label={label}>
              {units.map((unit) => (
                <span
                  key={unit.label}
                  className="glass flex min-w-16 flex-col items-center rounded-2xl border border-border px-3 py-2 shadow-sm"
                >
                  <span
                    key={unit.value}
                    className="font-metric inline-block text-2xl font-extrabold tabular-nums text-foreground animate-[countdown-pop_0.9s_ease-out] sm:text-3xl"
                  >
                    {String(unit.value).padStart(2, '0')}
                  </span>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {unit.label}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="w-full max-w-xs space-y-2 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-4 text-primary" aria-hidden />
              Registered
            </span>
            <span className="font-metric font-bold text-foreground">
              {participantCount}
              {maxParticipants !== null ? ` / ${maxParticipants}` : ''}
            </span>
          </div>
          {capacityPct !== null ? (
            <>
              <Progress value={capacityPct} size="sm" aria-label="Registration capacity" />
              <p className="text-xs text-muted-foreground">
                <span className="font-metric font-semibold text-primary">{capacityPct}%</span> full
                — seats go fast
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Open registration — claim your seat.</p>
          )}
        </div>
      </div>
      <div
        className={`relative h-1 bg-gradient-to-r ${phase === 'live' ? 'from-success to-success/40' : 'from-primary via-accent-foreground to-primary'}`}
        aria-hidden
      />
    </div>
  );
}

export default function ContestDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { data: contest, isLoading, isError, error, refetch } = useContest(id);
  const showStandings = contest?.phase === 'past' || contest?.phase === 'live';
  const [boardPage, setBoardPage] = useState(1);
  const { data: leaderboard } = useContestLeaderboard(id, showStandings, {
    page: boardPage,
    pageSize: 25,
    live: contest?.phase === 'live',
  });
  const { data: result } = useContestResult(id, Boolean(contest?.participant?.submittedAt));
  const register = useRegisterContest(contest?.id);
  const unregister = useUnregisterContest(contest?.id);
  const start = useStartContest(contest?.id);
  const { user } = useAuth();
  const manageAccess = useAdminAccess(['manage:contests']);
  // UX hint only — the manage API re-checks permission + ownership.
  const canManage = Boolean(
    user &&
    contest &&
    manageAccess.allowed &&
    (user.roles?.includes('admin') ||
      user.permissions?.includes('manage:platform') ||
      (contest.organizer.id !== null && contest.organizer.id === user.id)),
  );

  if (isLoading) {
    return (
      <div className="animate-fade-in space-y-6" aria-busy="true" aria-label="Loading contest">
        <div className="space-y-2">
          <div className="skeleton-shine h-8 w-72 max-w-full rounded-lg" />
          <div className="skeleton-shine h-4 w-96 max-w-full rounded-md" />
        </div>
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="rounded-xl border border-border p-6">
              <div className="flex gap-2">
                <div className="skeleton-shine h-6 w-20 rounded-full" />
                <div className="skeleton-shine h-6 w-24 rounded-full" />
              </div>
              <div className="skeleton-shine mt-4 h-4 w-full rounded-md" />
              <div className="skeleton-shine mt-2 h-4 w-5/6 rounded-md" />
            </div>
          </div>
          <div className="rounded-xl border border-border p-6">
            <div className="skeleton-shine h-5 w-32 rounded-md" />
            <div className="skeleton-shine mt-3 h-10 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }
  if (isError || !contest) {
    return (
      <ErrorState
        description={error instanceof ApiError ? error.message : 'Contest not found.'}
        onRetry={() => void refetch()}
      />
    );
  }

  const capacityPct =
    contest.maxParticipants !== null && contest.maxParticipants > 0
      ? Math.min(100, Math.round((contest.participantCount / contest.maxParticipants) * 100))
      : null;

  const onRegister = (): void => {
    register.mutate(undefined, {
      onSuccess: () => {
        toast.success('Registered for this contest.');
        void refetch();
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Registration failed.'),
    });
  };
  const onUnregister = (): void => {
    unregister.mutate(undefined, {
      onSuccess: () => {
        toast.success('Registration withdrawn.');
        void refetch();
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Withdrawal failed.'),
    });
  };
  const onEnter = (): void => {
    start.mutate(undefined, {
      onSuccess: () => router.push(`/contests/${contest.id}/compete`),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.message : 'Could not enter the contest.'),
    });
  };

  const canEnter =
    contest.isRegistered && contest.phase === 'live' && !contest.participant?.submittedAt;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={contest.phase === 'live' ? 'Live now — ratings on the line' : `Contest · ${contest.phase}`}
        title={contest.name}
        description={`${contest.questionCount} questions · ${contest.durationMinutes} min · mixed levels`}
      />
      <ContestCountdownHero
        phase={contest.phase}
        startsAt={contest.startsAt}
        endsAt={contest.endsAt}
        participantCount={contest.participantCount}
        maxParticipants={contest.maxParticipants}
        capacityPct={capacityPct}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="page-enter-1 space-y-6 lg:col-span-2">
          <Card className="animate-fade-up overflow-hidden">
            <span
              className={`block h-1 bg-gradient-to-r ${contest.phase === 'live' ? 'from-success to-success/50' : 'from-primary to-accent-foreground'}`}
              aria-hidden
            />
            <CardContent className="space-y-4 p-6">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={
                    contest.phase === 'live'
                      ? 'success'
                      : contest.phase === 'past'
                        ? 'secondary'
                        : 'warning'
                  }
                  className="flex items-center gap-1.5"
                >
                  {contest.phase === 'live' ? <span className="live-dot" aria-hidden /> : null}
                  {contest.status.replace(/_/g, ' ')}
                </Badge>
                <Badge variant="outline" title="Every contest mixes easy, medium and hard problems">
                  Mixed levels
                </Badge>
                <Badge variant="outline">
                  {contest.participantCount}
                  {contest.maxParticipants !== null ? ` / ${contest.maxParticipants}` : ''}{' '}
                  registered
                </Badge>
              </div>
              {contest.description ? (
                <CardDescription className="text-sm leading-relaxed">
                  {contest.description}
                </CardDescription>
              ) : null}
              {contest.rules ? (
                <div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4 text-sm leading-relaxed text-muted-foreground">
                  <p className="mb-1 text-metadata font-semibold uppercase tracking-[0.14em] text-primary">
                    Rules
                  </p>
                  {contest.rules}
                </div>
              ) : null}
              <dl className="grid grid-cols-2 gap-2.5">
                {[
                  { icon: CalendarClock, label: 'Starts', value: formatDateTime(contest.startsAt) },
                  { icon: CalendarClock, label: 'Ends', value: formatDateTime(contest.endsAt) },
                  { icon: Timer, label: 'Duration', value: `${contest.durationMinutes} min` },
                  { icon: ListChecks, label: 'Questions', value: String(contest.questionCount) },
                ].map((fact) => (
                  <div
                    key={fact.label}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md hover:shadow-primary/10"
                  >
                    <span className="icon-tile size-9 shrink-0" aria-hidden>
                      <fact.icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {fact.label}
                      </dt>
                      <dd className="truncate text-sm font-semibold text-foreground" title={fact.value}>
                        {fact.value}
                      </dd>
                    </span>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Registration closes{' '}
                  <span className="font-medium text-foreground">
                    {formatDateTime(contest.registrationClosesAt)}
                  </span>
                </span>
                <span>
                  Organized by{' '}
                  <span className="font-medium text-foreground">{contest.organizer.displayName}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          {showStandings ? (
            <Card className="animate-fade-in">
              <CardContent className="space-y-3 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-card-title">
                    Standings
                    <span className="h-px w-10 bg-gradient-to-r from-primary/40 to-transparent" aria-hidden />
                  </CardTitle>
                  {contest?.phase === 'live' ? (
                    <Badge variant="success" className="flex items-center gap-1.5">
                      <span className="live-dot" aria-hidden />
                      Live · auto-refreshes
                    </Badge>
                  ) : null}
                </div>
                {result?.rank !== null && result?.rank !== undefined ? (
                  <p
                    role="status"
                    className="rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-foreground"
                  >
                    You are rank <span className="font-metric font-bold">#{result.rank}</span>
                    {result.totalParticipants > 0 ? (
                      <>
                        {' '}
                        of <span className="font-metric">{result.totalParticipants}</span>
                      </>
                    ) : null}
                  </p>
                ) : null}
                {!leaderboard || leaderboard.items.length === 0 ? (
                  <EmptyState
                    title="No standings yet"
                    description="Standings appear once participants start submitting."
                  />
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full min-w-[420px] text-left text-sm sm:min-w-[560px]">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Rank</th>
                            <th className="px-3 py-2 font-medium">Contestant</th>
                            <th className="px-3 py-2 font-medium">Solved</th>
                            <th className="px-3 py-2 font-medium">Score</th>
                            {/* Secondary columns collapse on phones; the
                                table still scrolls, but the core standings
                                fit without scrolling on most screens. */}
                            <th className="hidden px-3 py-2 font-medium sm:table-cell">Wrong</th>
                            <th className="hidden px-3 py-2 font-medium sm:table-cell">Time</th>
                            <th className="hidden px-3 py-2 font-medium md:table-cell">Rating</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.items.map((row) => (
                            <tr
                              key={row.userId}
                              aria-current={row.isCurrentUser ? 'true' : undefined}
                              className={
                                row.isCurrentUser
                                  ? 'border-b border-border bg-primary/10 shadow-[inset_2px_0_0_hsl(var(--primary))] last:border-0'
                                  : 'row-glow border-b border-border last:border-0'
                              }
                            >
                              <td className="px-3 py-2 font-metric text-muted-foreground">
                                {row.rank}
                              </td>
                              <td className="max-w-48 truncate px-3 py-2 font-medium">
                                <ProfileName
                                  username={row.username}
                                  displayName={row.displayName}
                                />
                                {row.isCurrentUser ? ' (you)' : ''}
                              </td>
                              <td className="px-3 py-2 font-metric">{row.solvedCount}</td>
                              <td className="px-3 py-2 font-metric">{row.score}</td>
                              <td className="hidden px-3 py-2 font-metric sm:table-cell">
                                {row.wrongCount}
                              </td>
                              <td className="hidden px-3 py-2 font-metric sm:table-cell">
                                {row.completionSeconds}s
                              </td>
                              <td
                                className={`hidden px-3 py-2 font-metric md:table-cell ${
                                  row.ratingChange === null
                                    ? 'text-muted-foreground'
                                    : row.ratingChange >= 0
                                      ? 'text-success'
                                      : 'text-destructive'
                                }`}
                              >
                                {row.ratingChange === null
                                  ? '—'
                                  : `${row.ratingChange >= 0 ? '+' : ''}${row.ratingChange}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {leaderboard.meta.totalPages > 1 ? (
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={boardPage <= 1}
                          onClick={() => setBoardPage((page) => Math.max(1, page - 1))}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Page <span className="font-metric">{boardPage}</span> of{' '}
                          <span className="font-metric">{leaderboard.meta.totalPages}</span>
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={boardPage >= leaderboard.meta.totalPages}
                          onClick={() => setBoardPage((page) => page + 1)}
                        >
                          Next
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {result ? (
            <Card className="animate-scale-in border-primary/30 shadow-lg shadow-primary/10">
              <CardContent className="space-y-3 p-6">
                <CardTitle className="flex items-center gap-2 text-card-title">
                  <span className="gradient-text-cool">Your result</span>
                </CardTitle>
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-muted-foreground">Solved</p>
                    <p className="font-metric text-lg">{result.solvedCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Wrong</p>
                    <p className="font-metric text-lg">{result.wrongCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Rank</p>
                    <p className="font-metric text-lg">{result.rank ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Rating</p>
                    <p className="font-metric text-lg">
                      {result.rating ? `${result.rating.before} → ${result.rating.after}` : '—'}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Finished in <span className="font-metric">{result.completionSeconds}s</span>.
                  Rating blends rank vs the field with a pace bonus for beating the median finish
                  time
                  {result.rating ? (
                    <>
                      {' '}
                      (
                      <span className="font-metric">
                        {result.rating.before} → {result.rating.after}
                      </span>
                      )
                    </>
                  ) : (
                    ' — settling shortly after the contest ends'
                  )}
                  .
                </p>
                {contest.phase === 'past' ? (
                  <Link href={`/contests/${contest.id}/upsolve`}>
                    <Button variant="outline" size="sm">
                      Review solutions (upsolve)
                    </Button>
                  </Link>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="page-enter-2 space-y-6">
          {canManage && contest ? (
            <Card className="card-lift">
              <CardContent className="space-y-3 p-6">
                <CardTitle className="text-card-title">Organizer</CardTitle>
                <Button className="w-full transition-all duration-300 hover:-translate-y-0.5" variant="outline" asChild>
                  <Link href={`/contests/${contest.id}/manage`}>
                    <Settings2 aria-hidden />
                    Manage contest
                  </Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  Questions, schedule, and publishing.
                </p>
              </CardContent>
            </Card>
          ) : null}
          <Card className="card-lift overflow-hidden">
            <span className="block h-1 bg-gradient-to-r from-primary to-accent-foreground" aria-hidden />
            <CardContent className="space-y-3 p-6">
              <CardTitle className="text-card-title">Your entry</CardTitle>
              {canEnter ? (
                <Button
                  className="btn-sheen w-full shadow-lg shadow-primary/25 transition-all duration-300 hover:-translate-y-0.5"
                  onClick={onEnter}
                  disabled={start.isPending}
                >
                  {start.isPending ? <span className="typing-dots">Entering</span> : 'Enter contest'}
                </Button>
              ) : contest.isRegistered ? (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={onUnregister}
                  disabled={unregister.isPending || contest.phase !== 'upcoming'}
                >
                  {unregister.isPending ? 'Withdrawing…' : 'Withdraw registration'}
                </Button>
              ) : (
                <Button
                  className="btn-sheen w-full transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/25 disabled:hover:translate-y-0 disabled:hover:shadow-none"
                  onClick={onRegister}
                  disabled={register.isPending || !contest.registrationOpen}
                >
                  {register.isPending ? <span className="typing-dots">Registering</span> : 'Register'}
                </Button>
              )}
              {!contest.registrationOpen && !contest.isRegistered ? (
                <p className="text-xs text-muted-foreground">
                  Registration is currently closed for this contest.
                </p>
              ) : null}
              {contest.participant?.submittedAt ? (
                <p className="text-xs text-muted-foreground">
                  Submitted {formatDateTime(contest.participant.submittedAt)}. Results are final and
                  computed server-side.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
