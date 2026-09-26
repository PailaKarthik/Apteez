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
  LoadingState,
  Progress,
} from '@apteez/ui';
import { Settings2 } from 'lucide-react';
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
    return <LoadingState title="Loading contest…" />;
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
        title={contest.name}
        description={`${contest.questionCount} questions · ${contest.durationMinutes} min · mixed levels`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
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
                >
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
                <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
                  {contest.rules}
                </div>
              ) : null}
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Starts</dt>
                  <dd className="font-medium">{formatDateTime(contest.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ends</dt>
                  <dd className="font-medium">{formatDateTime(contest.endsAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Registration closes</dt>
                  <dd className="font-medium">{formatDateTime(contest.registrationClosesAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Organizer</dt>
                  <dd className="font-medium">{contest.organizer.displayName}</dd>
                </div>
              </dl>
              {capacityPct !== null ? (
                <div className="space-y-1">
                  <Progress value={capacityPct} aria-label="Registration capacity" />
                  <p className="text-xs text-muted-foreground">{capacityPct}% full</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {showStandings ? (
            <Card>
              <CardContent className="space-y-3 p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-card-title">Standings</CardTitle>
                  {contest?.phase === 'live' ? (
                    <Badge variant="success">Live · auto-refreshes</Badge>
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
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead>
                          <tr className="border-b border-border text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">Rank</th>
                            <th className="px-3 py-2 font-medium">Contestant</th>
                            <th className="px-3 py-2 font-medium">Solved</th>
                            <th className="px-3 py-2 font-medium">Score</th>
                            <th className="px-3 py-2 font-medium">Wrong</th>
                            <th className="px-3 py-2 font-medium">Time</th>
                            <th className="px-3 py-2 font-medium">Rating</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboard.items.map((row) => (
                            <tr
                              key={row.userId}
                              aria-current={row.isCurrentUser ? 'true' : undefined}
                              className={
                                row.isCurrentUser
                                  ? 'border-b border-border bg-primary/10 last:border-0'
                                  : 'border-b border-border last:border-0 hover:bg-muted/40'
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
                              <td className="px-3 py-2 font-metric">{row.wrongCount}</td>
                              <td className="px-3 py-2 font-metric">{row.completionSeconds}s</td>
                              <td
                                className={`px-3 py-2 font-metric ${
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
            <Card>
              <CardContent className="space-y-3 p-6">
                <CardTitle className="text-card-title">Your result</CardTitle>
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

        <div className="space-y-6">
          {canManage && contest ? (
            <Card>
              <CardContent className="space-y-3 p-6">
                <CardTitle className="text-card-title">Organizer</CardTitle>
                <Button className="w-full" variant="outline" asChild>
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
          <Card>
            <CardContent className="space-y-3 p-6">
              <CardTitle className="text-card-title">Your entry</CardTitle>
              {canEnter ? (
                <Button className="w-full" onClick={onEnter} disabled={start.isPending}>
                  {start.isPending ? 'Entering…' : 'Enter contest'}
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
                  className="w-full"
                  onClick={onRegister}
                  disabled={register.isPending || !contest.registrationOpen}
                >
                  {register.isPending ? 'Registering…' : 'Register'}
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
