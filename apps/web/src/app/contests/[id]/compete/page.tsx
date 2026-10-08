'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
  Progress,
  cn,
} from '@apteez/ui';
import { PageHeader } from '@/components/shared/page-header';
import { ContestLockdown } from '@/components/contests/contest-lockdown';
import { OptionRenderer } from '@/components/problems/option-renderer';
import { QuestionRenderer } from '@/components/problems/question-renderer';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';
import {
  useAnswerContestQuestion,
  useContest,
  useContestSession,
  useContestSubmitPreview,
  useSubmitContest,
  useToggleContestReview,
} from '@/hooks/use-contests';

/** Client-side mirror of the server clock; display only, never authoritative. */
function useCountdown(target: string | null, serverTime: string | null): number {
  const offsetRef = React.useRef(0);
  const [remaining, setRemaining] = React.useState(0);

  React.useEffect(() => {
    if (serverTime) {
      offsetRef.current = new Date(serverTime).getTime() - Date.now();
    }
  }, [serverTime]);

  React.useEffect(() => {
    if (!target) {
      setRemaining(0);
      return undefined;
    }
    const tick = (): void => {
      const now = Date.now() + offsetRef.current;
      setRemaining(Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000)));
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [target]);

  return remaining;
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function ContestCompetePage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);

  const { data: contest } = useContest(id);
  const { user } = useAuth();
  const session = useContestSession(id, true);
  const preview = useContestSubmitPreview(id, confirming);
  const answer = useAnswerContestQuestion(id);
  const toggleReview = useToggleContestReview(id);
  const submit = useSubmitContest(id);

  const data = session.data;
  const remaining = useCountdown(data?.effectiveEndAt ?? null, data?.serverTime ?? null);
  const autoSubmittedRef = React.useRef(false);

  // Server already finalized (submitted/expired elsewhere) → show the result.
  React.useEffect(() => {
    if (data?.submittedAt) {
      router.replace(`/contests/${id}`);
    }
  }, [data?.submittedAt, id, router]);

  const onSubmit = (): void => {
    submit.mutate(undefined, {
      onSuccess: () => {
        toast.success('Contest submitted. Results are final.');
        router.replace(`/contests/${id}`);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Submission failed.'),
    });
  };

  // Time runs out → auto-submit once with whatever is answered. Gated on the
  // SERVER's remainingSeconds (fresh every poll) — the client clock is
  // display-only and must never submit on its own, or a skewed device clock
  // finalizes a contest that still has time left.
  const serverExpired =
    Boolean(data) &&
    !data?.submittedAt &&
    (data?.totalQuestions ?? 0) > 0 &&
    (data?.remainingSeconds ?? 1) <= 0;
  React.useEffect(() => {
    if (!serverExpired || autoSubmittedRef.current || submit.isPending) {
      return;
    }
    autoSubmittedRef.current = true;
    toast.info("Time's up — auto-submitting your answers.");
    submit.mutate(undefined, {
      onSuccess: () => {
        toast.success('Contest auto-submitted. Results are final.');
        router.replace(`/contests/${id}`);
      },
      onError: (e) => {
        // The server beat us to finalizing on a parallel poll — that is the
        // same outcome, so go to results instead of scaring the user.
        if (e instanceof ApiError && /already submitted/i.test(e.message)) {
          router.replace(`/contests/${id}`);
          return;
        }
        autoSubmittedRef.current = false;
        toast.error(e instanceof ApiError ? e.message : 'Auto-submit failed — submit manually.');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverExpired]);

  if (session.isLoading) {
    return (
      <div className="animate-fade-in space-y-4" aria-busy="true" aria-label="Loading your contest session">
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="skeleton-shine h-6 w-32 rounded-full" />
              <div className="skeleton-shine h-6 w-24 rounded-md" />
            </div>
            <div className="skeleton-shine h-7 w-3/4 rounded-lg" />
            <div className="skeleton-shine h-28 w-full rounded-xl" />
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="skeleton-shine h-12 rounded-lg" />
              <div className="skeleton-shine h-12 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (session.isError || !data) {
    return (
      <ErrorState
        description={
          session.error instanceof ApiError ? session.error.message : 'Could not load the session.'
        }
        onRetry={() => void session.refetch()}
      />
    );
  }

  const current = data.current;
  const onSelect = (optionId: string): void => {
    answer.mutate(
      {
        questionId: current.questionId,
        selectedOptionId: optionId,
        currentPosition: data.currentPosition,
      },
      {
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not save your answer.'),
      },
    );
  };
  const onToggleReview = (): void => {
    toggleReview.mutate(
      {
        questionId: current.questionId,
        markedForReview: !current.markedForReview,
        currentPosition: data.currentPosition,
      },
      {
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not update review mark.'),
      },
    );
  };
  const onNavigate = (position: number): void => {
    if (position === data.currentPosition) {
      return;
    }
    // Position is server-persisted (refresh-safe); the review flag is
    // re-sent unchanged so navigation never alters answer state.
    toggleReview.mutate(
      {
        questionId: current.questionId,
        markedForReview: current.markedForReview,
        currentPosition: position,
      },
      {
        onError: (e) =>
          toast.error(e instanceof ApiError ? e.message : 'Could not change question.'),
      },
    );
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Question ${data.currentPosition + 1} of ${data.totalQuestions}`}
        title={contest?.name ?? 'Contest'}
        description="Answer every question before the server clock runs out — correctness stays hidden until evaluation."
        actions={
          <Badge
            variant={remaining <= 60 ? 'destructive' : 'secondary'}
            aria-live="polite"
            className={`flex items-center gap-1.5 px-3 py-1.5 font-metric text-sm shadow-lg ${remaining <= 60 ? 'animate-pulse-soft shadow-destructive/30' : 'shadow-primary/20'}`}
          >
            {remaining > 60 ? <span className="live-dot" aria-hidden /> : null}
            <span className="tabular-nums text-base font-extrabold">{formatCountdown(remaining)}</span>
            left
          </Badge>
        }
      />
      <div className="space-y-1.5" aria-label="Contest progress">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            <span className="gradient-text-cool font-metric font-bold">{data.answeredCount}</span>
            {' '}/ {data.totalQuestions} answered
          </span>
          <span className="font-metric">{Math.round((data.answeredCount / Math.max(1, data.totalQuestions)) * 100)}%</span>
        </div>
        <Progress value={(data.answeredCount / Math.max(1, data.totalQuestions)) * 100} size="sm" aria-label="Answered progress" />
      </div>
      <ContestLockdown
        contestId={id ?? ''}
        contestName={contest?.name ?? 'Contest'}
        participantLabel={user?.displayName || user?.username || user?.email || 'participant'}
      >
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2" key={current.position}>
            <Card className="animate-fade-up overflow-hidden shadow-md">
              <span className="block h-1 bg-gradient-to-r from-primary to-accent-foreground" aria-hidden />
              <CardContent className="space-y-4 p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    Question {current.position + 1} of {data.totalQuestions}
                  </Badge>
                  <Badge variant="outline">{current.difficulty}</Badge>
                  {current.markedForReview ? (
                    <Badge variant="warning">Marked for review</Badge>
                  ) : null}
                </div>
                <h2 className="text-lg font-semibold text-foreground">{current.title}</h2>
                <QuestionRenderer statement={current.statement} assets={current.assets} />
                <div className="space-y-2" role="radiogroup" aria-label="Answer options">
                  {current.options.map((option) => (
                    <OptionRenderer
                      key={option.id}
                      option={option}
                      selected={option.id === current.selectedOptionId}
                      // Never freeze on the in-flight request: the selection
                      // paints optimistically (see useAnswerContestQuestion)
                      // and the server upsert is idempotent, so tapping
                      // again while saving just re-saves. Only the contest
                      // rules (answerable) can lock the options.
                      disabled={!current.answerable}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate(data.currentPosition - 1)}
                    disabled={data.currentPosition <= 0 || toggleReview.isPending}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigate(data.currentPosition + 1)}
                    disabled={
                      data.currentPosition >= data.totalQuestions - 1 || toggleReview.isPending
                    }
                  >
                    Next
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onToggleReview}
                    disabled={toggleReview.isPending}
                  >
                    {current.markedForReview ? 'Unmark review' : 'Mark for review'}
                  </Button>
                  {data.currentPosition >= data.totalQuestions - 1 ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setConfirming(true);
                        document
                          .getElementById('contest-submit')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    >
                      Submit contest
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-4">
            <Card className="glass sticky top-top-bar shadow-sm">
              <CardContent className="space-y-3 p-6" id="contest-submit">
                <CardTitle className="flex items-center gap-2 text-card-title">
                  Navigator
                  <span className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" aria-hidden />
                </CardTitle>
                {/* 44px targets (WCAG minimum); long contests scroll inside
                    instead of pushing submit below the fold. */}
                <div
                  className="grid max-h-[240px] grid-cols-5 gap-2 overflow-y-auto"
                  role="group"
                  aria-label="Question navigator"
                >
                  {data.questions.map((item) => (
                    <button
                      key={item.questionId}
                      type="button"
                      onClick={() => onNavigate(item.position)}
                      disabled={toggleReview.isPending}
                      aria-label={`Go to question ${item.position + 1}: ${item.state}`}
                      aria-current={item.state === 'current' ? 'true' : undefined}
                      className={cn(
                        'flex min-h-11 min-w-11 items-center justify-center rounded-lg border text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md hover:shadow-primary/15 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none',
                        item.state === 'current'
                          ? 'border-primary bg-primary/10 font-semibold text-primary shadow-[0_0_16px_-4px_hsl(var(--primary)/0.5)]'
                          : item.state === 'answered'
                            ? 'border-success/50 bg-success/10 text-foreground'
                            : item.state === 'review'
                              ? 'border-warning/60 bg-warning/10 text-foreground'
                              : 'border-border text-muted-foreground',
                      )}
                    >
                      <span className="font-metric">{item.position + 1}</span>
                    </button>
                  ))}
                </div>
                <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <dt className="text-muted-foreground">Answered</dt>
                    <dd className="font-metric">{data.answeredCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Open</dt>
                    <dd className="font-metric">{data.unansweredCount}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Review</dt>
                    <dd className="font-metric">{data.reviewCount}</dd>
                  </div>
                </dl>
                {!confirming ? (
                  <Button
                    className="btn-sheen w-full shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5"
                    onClick={() => setConfirming(true)}
                  >
                    Review & submit
                  </Button>
                ) : !preview.data ? (
                  <div className="space-y-2" aria-busy="true" aria-label="Checking your submission">
                    <div className="loading-rail h-1" aria-hidden>
                      <span />
                    </div>
                    <div className="skeleton-shine h-4 w-2/3 rounded-md" />
                    <div className="skeleton-shine h-9 w-full rounded-lg" />
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border border-border p-3 text-sm">
                    <p className="text-muted-foreground">
                      <span className="font-metric text-foreground">
                        {preview.data.answeredCount}
                      </span>{' '}
                      answered ·{' '}
                      <span className="font-metric text-foreground">
                        {preview.data.unansweredCount}
                      </span>{' '}
                      unanswered ·{' '}
                      <span className="font-metric text-foreground">
                        {preview.data.reviewCount}
                      </span>{' '}
                      marked
                    </p>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={onSubmit} disabled={submit.isPending}>
                        {submit.isPending ? 'Submitting…' : 'Submit final'}
                      </Button>
                      <Button variant="outline" onClick={() => setConfirming(false)}>
                        Back
                      </Button>
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The server clock decides the deadline — a slow connection never extends it.
                </p>
              </CardContent>
            </Card>
            <Link href={`/contests/${id}`}>
              <Button variant="ghost" size="sm">
                Back to contest overview
              </Button>
            </Link>
            {data.questions.length === 0 ? (
              <EmptyState
                title="No questions"
                description="This contest has no questions assigned."
              />
            ) : null}
          </div>
        </div>
      </ContestLockdown>
    </div>
  );
}
