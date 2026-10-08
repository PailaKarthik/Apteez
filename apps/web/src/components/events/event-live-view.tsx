'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardTitle,
  EmptyState,
  ErrorState,
} from '@apteez/ui';
import { QuestionRenderer } from '@/components/problems/question-renderer';
import { OptionRenderer } from '@/components/problems/option-renderer';
import { ApiError } from '@/lib/api-client';
import {
  useAnswerEvent,
  useEventResult,
  useEventSession,
  useJoinEvent,
  useReviewEvent,
  useSubmitEvent,
  useSubmitPreviewEvent,
} from '@/hooks/use-events';

function useCountdown(targetIso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!targetIso) {
    return 0;
  }
  return Math.max(0, Math.ceil((new Date(targetIso).getTime() - now) / 1000));
}

function formatCountdown(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function EventLiveView({ eventId }: { eventId: string }): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const join = useJoinEvent(eventId);
  const { data: session, isLoading, isError, error, refetch } = useEventSession(eventId);
  const { data: result } = useEventResult(session?.submittedAt ? eventId : undefined);
  const preview = useSubmitPreviewEvent(eventId, confirming);
  const answer = useAnswerEvent(eventId);
  const review = useReviewEvent(eventId);
  const submit = useSubmitEvent(eventId);
  const remaining = useCountdown(session?.effectiveEndAt ?? null);

  useEffect(() => {
    if (isError && error instanceof ApiError && /Join|registered/i.test(error.message)) {
      join.mutate(undefined, {
        onSuccess: () => void refetch(),
        onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not join.'),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError]);

  const current = session?.current;
  const options = useMemo(() => current?.options ?? [], [current]);

  if (isLoading) {
    return (
      <div className="animate-fade-in grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="Loading your event session">
        <div className="space-y-4 lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="loading-rail h-1" aria-hidden>
              <span />
            </div>
            <div className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <div className="skeleton-shine h-6 w-32 rounded-full" />
                <div className="skeleton-shine h-4 w-20 rounded-md" />
              </div>
              <div className="skeleton-shine h-7 w-3/4 rounded-lg" />
              <div className="skeleton-shine h-24 w-full rounded-xl" />
              <div className="grid gap-2">
                <div className="skeleton-shine h-12 w-full rounded-lg" />
                <div className="skeleton-shine h-12 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border p-6">
          <div className="skeleton-shine h-5 w-24 rounded-md" />
          <div className="mt-3 grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="skeleton-shine h-11 rounded-md" />
            ))}
          </div>
          <div className="skeleton-shine mt-4 h-10 w-full rounded-lg" />
        </div>
      </div>
    );
  }
  if (isError || !session) {
    return (
      <ErrorState
        description={error instanceof ApiError ? error.message : 'Session unavailable.'}
        onRetry={() => void refetch()}
      />
    );
  }
  if (result) {
    return (
      <Card className="animate-scale-in overflow-hidden border-success/30">
        <span className="block h-1 bg-gradient-to-r from-success to-success/40" aria-hidden />
        <CardContent className="space-y-3 p-6">
          <CardTitle className="text-card-title">
            Submitted — score <span className="gradient-text-cool font-metric font-extrabold">{result.score}</span>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Correct <span className="font-metric">{result.correctCount}</span> · Wrong{' '}
            <span className="font-metric">{result.wrongCount}</span> · Time{' '}
            <span className="font-metric">{result.completionSeconds}s</span>
            {result.rank !== null ? (
              <span>
                {' '}
                · Rank <span className="font-metric">#{result.rank}</span> of{' '}
                {result.totalParticipants}
              </span>
            ) : null}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="page-enter space-y-4 lg:col-span-2">
        <Card className="overflow-hidden">
          <div className="loading-rail h-0.5" aria-hidden>
            <span />
          </div>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant="success" className="flex shrink-0 items-center gap-1.5">
                <span className="live-dot" aria-hidden />
                Live ·{' '}
                <span className="font-metric tabular-nums">{formatCountdown(remaining)}</span> left
              </Badge>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                Q <span className="font-metric">{(session.currentPosition ?? 0) + 1}</span> /{' '}
                <span className="font-metric">{session.totalQuestions}</span>
              </span>
            </div>
            {current ? (
              <>
                <h2 className="text-card-title">
                  {current.title}{' '}
                  <span className="text-sm text-muted-foreground">({current.points} pts)</span>
                </h2>
                <QuestionRenderer statement={current.statement} assets={current.assets} />
                <div className="space-y-2">
                  {options.map((opt) => (
                    <OptionRenderer
                      key={opt.id}
                      option={opt}
                      selected={current.selectedOptionId === opt.id}
                      disabled={!current.answerable || answer.isPending}
                      onSelect={(optionId) =>
                        answer.mutate(
                          {
                            questionId: current.questionId,
                            selectedOptionId: optionId,
                            currentPosition: session.currentPosition,
                          },
                          {
                            onSuccess: () => void refetch(),
                            onError: (e) =>
                              toast.error(e instanceof ApiError ? e.message : 'Could not save.'),
                          },
                        )
                      }
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate(
                        {
                          questionId: current.questionId,
                          markedForReview: !current.markedForReview,
                        },
                        { onSuccess: () => void refetch() },
                      )
                    }
                  >
                    {current.markedForReview ? 'Unmark review' : 'Mark for review'}
                  </Button>
                  {!current.answerable ? <Badge variant="outline">Read-only</Badge> : null}
                </div>
              </>
            ) : (
              <EmptyState
                title="No questions"
                description="The organizer has not added questions yet."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <div className="page-enter-1 space-y-4">
        <Card className="glass sticky top-top-bar shadow-sm">
          <CardContent className="space-y-3 p-6">
            <CardTitle className="flex items-center gap-2 text-card-title">
              Navigator
              <span className="h-px flex-1 bg-gradient-to-r from-primary/40 to-transparent" aria-hidden />
            </CardTitle>
            {/* Real buttons (44px targets): position jumps reuse the review
                mutation with an unchanged flag, mirroring contests. Long
                question lists scroll instead of pushing submit off-screen. */}
            <div
              className="grid max-h-[240px] grid-cols-5 gap-2 overflow-y-auto"
              role="group"
              aria-label="Question navigator"
            >
              {session.questions.map((q) => (
                <button
                  key={q.questionId}
                  type="button"
                  disabled={review.isPending || q.position === session.currentPosition}
                  onClick={() =>
                    current &&
                    review.mutate(
                      {
                        questionId: current.questionId,
                        markedForReview: current.markedForReview,
                        currentPosition: q.position,
                      },
                      { onSuccess: () => void refetch() },
                    )
                  }
                  aria-label={`Go to question ${q.position + 1}: ${q.state}`}
                  className={`flex min-h-11 min-w-11 items-center justify-center rounded-md border text-center font-metric text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md hover:shadow-primary/15 disabled:opacity-60 ${q.state === 'current' ? 'border-primary bg-primary/10 shadow-[0_0_16px_-4px_hsl(var(--primary)/0.5)]' : q.state === 'answered' ? 'border-success/50 bg-success/5' : q.state === 'review' ? 'border-warning/60 bg-warning/5' : ''}`}
                >
                  {q.position + 1}
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              Answered <span className="font-metric">{session.answeredCount}</span> · Review{' '}
              <span className="font-metric">{session.reviewCount}</span>
            </p>
            {!confirming ? (
              <Button className="w-full" onClick={() => setConfirming(true)}>
                Review & submit
              </Button>
            ) : (
              <div className="space-y-2 text-sm">
                <p>
                  Answered <span className="font-metric">{preview.data?.answeredCount ?? '…'}</span>{' '}
                  · Unanswered{' '}
                  <span className="font-metric">{preview.data?.unansweredCount ?? '…'}</span> ·
                  Review <span className="font-metric">{preview.data?.reviewCount ?? '…'}</span>
                </p>
                <Button
                  className="w-full"
                  disabled={submit.isPending}
                  onClick={() =>
                    submit.mutate(undefined, {
                      onSuccess: () => {
                        setConfirming(false);
                        void refetch();
                      },
                      onError: (e) =>
                        toast.error(e instanceof ApiError ? e.message : 'Submit failed.'),
                    })
                  }
                >
                  Confirm submit
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => setConfirming(false)}>
                  Keep solving
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
