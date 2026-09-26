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
  LoadingState,
} from '@apteez/ui';
import { QuestionRenderer } from '@/components/problems/question-renderer';
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
    return <LoadingState title="Loading your event session…" />;
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
      <Card>
        <CardContent className="space-y-3 p-6">
          <CardTitle className="text-card-title">
            Submitted — score <span className="font-metric">{result.score}</span>
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
      <div className="space-y-4 lg:col-span-2">
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="success">
                Live · <span className="font-metric">{formatCountdown(remaining)}</span> left
              </Badge>
              <span className="text-sm text-muted-foreground">
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
                    <button
                      key={opt.id}
                      disabled={!current.answerable || answer.isPending}
                      onClick={() =>
                        answer.mutate(
                          {
                            questionId: current.questionId,
                            selectedOptionId: opt.id,
                            currentPosition: session.currentPosition,
                          },
                          {
                            onSuccess: () => void refetch(),
                            onError: (e) =>
                              toast.error(e instanceof ApiError ? e.message : 'Could not save.'),
                          },
                        )
                      }
                      className={`w-full rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary/50 ${current.selectedOptionId === opt.id ? 'border-primary bg-primary/5' : ''}`}
                    >
                      {opt.text ?? '(image option)'}
                    </button>
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
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 p-6">
            <CardTitle className="text-card-title">Navigator</CardTitle>
            <div className="grid grid-cols-5 gap-2">
              {session.questions.map((q) => (
                <span
                  key={q.questionId}
                  className={`rounded-md border p-2 text-center font-metric text-sm ${q.state === 'current' ? 'border-primary bg-primary/10' : q.state === 'answered' ? 'border-success/50' : q.state === 'review' ? 'border-warning/60' : ''}`}
                >
                  {q.position + 1}
                </span>
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
