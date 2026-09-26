'use client';

import { Check, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';
import type { ContestManageDto } from '@apteez/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Progress,
} from '@apteez/ui';
import {
  useAddContestQuestion,
  useContestManage,
  usePublishContest,
  useRemoveContestQuestion,
  useRetryContestRatings,
} from '@/hooks/use-contests';
import { useProblemsFeed } from '@/hooks/use-problems';
import { authErrorMessage } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api-client';
import { NewProblemDialog, type CreatedProblem } from '@/components/admin/new-problem-dialog';

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

/** Problem picker: search published problems and attach exactly one. */
function ProblemPicker({
  contestId,
  excludeIds,
  nextSlot,
  total,
}: {
  contestId: string;
  excludeIds: Set<string>;
  nextSlot: number;
  total: number;
}): React.JSX.Element {
  const [search, setSearch] = React.useState('');
  const deferred = React.useDeferredValue(search.trim());
  const feed = useProblemsFeed(deferred ? { search: deferred } : {}, 8);
  const add = useAddContestQuestion(contestId);
  const [addingId, setAddingId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);

  const attach = async (problemId: string): Promise<void> => {
    setAddingId(problemId);
    try {
      await add.mutateAsync({ problemId });
      setSearch('');
    } finally {
      setAddingId(null);
    }
  };

  /** Fresh problem for this slot: created published, so it lands in the library too. */
  const createAndAttach = (created: CreatedProblem | undefined): void => {
    if (!created) {
      return;
    }
    void attach(created.id).then(() =>
      toast.success(`"${created.title}" created and added as question ${nextSlot}.`),
    );
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-section-title text-foreground">
            Add question <span className="font-metric">{nextSlot}</span> of{' '}
            <span className="font-metric">{total}</span>
          </h3>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">one at a time</Badge>
            <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
              <Plus aria-hidden />
              New problem
            </Button>
          </div>
        </div>
        <NewProblemDialog open={creating} onOpenChange={setCreating} onCreated={createAndAttach} />
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-9"
            placeholder="Search published problems by title…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search problems"
          />
        </div>
        {add.isError ? (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {authErrorMessage(add.error, 'Could not add that question.')}
          </p>
        ) : null}
        {feed.isPending ? (
          <LoadingState title="Loading problems…" />
        ) : feed.isError ? (
          <ErrorState title="Could not load problems" onRetry={() => void feed.refetch()} />
        ) : feed.problems.length === 0 ? (
          <EmptyState
            title="No problems found"
            description="Try a different search — only published problems can be attached."
          />
        ) : (
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {feed.problems.map((problem) =>
              excludeIds.has(problem.id) ? null : (
                <li
                  key={problem.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-elevated p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{problem.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {problem.category.name} · rating{' '}
                      <span className="font-metric">{problem.rating}</span>
                    </p>
                  </div>
                  <Badge variant={DIFFICULTY_TONE[problem.difficulty]}>{problem.difficulty}</Badge>
                  <Button
                    size="sm"
                    disabled={add.isPending}
                    onClick={() => void attach(problem.id)}
                  >
                    {addingId === problem.id ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : (
                      <Plus aria-hidden />
                    )}
                    Add
                  </Button>
                </li>
              ),
            )}
          </ul>
        )}
        {feed.hasNextPage ? (
          <Button variant="outline" className="w-full" onClick={() => void feed.fetchNextPage()}>
            Load more
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * Step 2 of creation (also the manage-page body): attached questions in
 * order, the picker for the next slot, progress, and publish. Everything
 * re-reads the manage query, so two tabs stay consistent.
 */
export function ContestQuestionsStep({
  contestId,
  onPublished,
}: {
  contestId: string;
  onPublished?: (manage: ContestManageDto) => void;
}): React.JSX.Element {
  const manage = useContestManage(contestId);
  const remove = useRemoveContestQuestion(contestId);
  const publish = usePublishContest(contestId);
  const retryRatings = useRetryContestRatings(contestId);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const detach = async (questionId: string): Promise<void> => {
    if (!window.confirm('Remove this question from the contest?')) {
      return;
    }
    setRemovingId(questionId);
    try {
      await remove.mutateAsync(questionId);
    } finally {
      setRemovingId(null);
    }
  };

  if (manage.isPending) {
    return <LoadingState title="Loading contest…" />;
  }
  if (manage.isError || !manage.data) {
    return <ErrorState title="Could not load this contest" onRetry={() => void manage.refetch()} />;
  }

  const data = manage.data;
  const complete = data.addedCount >= data.questionCount;
  const excludeIds = new Set(data.questions.map((q) => q.problem.id));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge>Step 2</Badge>
              <h2 className="text-section-title text-foreground">{data.title}</h2>
            </div>
            <Badge variant={data.status === 'DRAFT' ? 'warning' : 'success'}>{data.status}</Badge>
          </div>
          <Progress value={(data.addedCount / Math.max(1, data.questionCount)) * 100} />
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-metric">{data.addedCount}</span> of{' '}
            <span className="font-metric">{data.questionCount}</span> questions added ·{' '}
            {data.durationMinutes} min ·{' '}
            {complete ? 'ready to publish' : 'add them one by one below'}
          </p>
          {data.status !== 'DRAFT' ? (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              This contest is {data.status.toLowerCase()} — questions are locked.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {remove.isError ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {authErrorMessage(remove.error, 'Could not remove that question.')}
        </p>
      ) : null}

      {data.questions.length > 0 ? (
        <ol className="space-y-2">
          {data.questions.map((question, index) => (
            <li key={question.questionId}>
              <Card>
                <CardContent className="flex items-center gap-3 p-4">
                  <span className="font-metric flex size-8 shrink-0 items-center justify-center rounded-full bg-success/15 text-sm font-bold text-success">
                    {question.position + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      Q{index + 1} ·{' '}
                      <Link
                        href={`/problems/${question.problem.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {question.problem.title}
                      </Link>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {question.points} pt · {question.problem.difficulty} · in the library
                    </p>
                  </div>
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                  {data.status === 'DRAFT' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => void detach(question.questionId)}
                      aria-label={`Remove question ${index + 1}`}
                    >
                      {removingId === question.questionId ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <Trash2 aria-hidden />
                      )}
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          title="No questions yet"
          description={`Add ${data.questionCount} question${data.questionCount === 1 ? '' : 's'} below — slot 1 is waiting.`}
        />
      )}

      {data.status === 'DRAFT' && !complete ? (
        <ProblemPicker
          contestId={contestId}
          excludeIds={excludeIds}
          nextSlot={data.addedCount + 1}
          total={data.questionCount}
        />
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-section-title text-foreground">Publish</h3>
          {data.publishBlockers.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {data.publishBlockers.map((blocker) => (
                <li key={blocker}>• {blocker}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-success">Everything is ready — publish when you are.</p>
          )}
          {publish.isError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {publish.error instanceof ApiError
                ? publish.error.message
                : 'Could not publish this contest.'}
            </p>
          ) : null}
          <Button
            disabled={!data.canPublish || publish.isPending}
            onClick={() => void publish.mutateAsync().then((manage) => onPublished?.(manage))}
          >
            {publish.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Publish contest
          </Button>
          {data.status === 'ENDED' ? (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-sm">
                Ratings:{' '}
                <Badge
                  variant={
                    data.ratingStatus === 'COMPLETED'
                      ? 'success'
                      : data.ratingStatus === 'FAILED'
                        ? 'destructive'
                        : 'warning'
                  }
                >
                  {data.ratingStatus}
                </Badge>
              </p>
              {data.ratingStatus !== 'COMPLETED' ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Stuck after the end? Re-run ranking + rating — completed rows are never
                    double-applied.
                  </p>
                  {retryRatings.isError ? (
                    <p
                      role="alert"
                      className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      {retryRatings.error instanceof ApiError
                        ? retryRatings.error.message
                        : 'Rating repair failed.'}
                    </p>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={retryRatings.isPending}
                    onClick={() =>
                      void retryRatings
                        .mutateAsync()
                        .then((outcome) =>
                          toast.success(
                            outcome.ratingsApplied
                              ? 'Ratings applied.'
                              : `Ranked ${outcome.ranked} — nothing new to rate.`,
                          ),
                        )
                    }
                  >
                    {retryRatings.isPending ? (
                      <Loader2 className="animate-spin" aria-hidden />
                    ) : null}
                    Recalculate ratings
                  </Button>
                </>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
