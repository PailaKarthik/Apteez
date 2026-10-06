'use client';

import { ArrowLeft, ArrowRight, BookOpen, Check, RotateCcw, Sparkles, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import type { AttemptResultDto } from '@apteez/types';
import { difficultyForRating } from '@apteez/types';
import { Badge, Button, Card, CardContent, ErrorState, ProgressRing, cn } from '@apteez/ui';
import { useProblem } from '@/hooks/use-problems';
import { useAuth } from '@/hooks/use-auth';
import { useFavoriteMembership } from '@/hooks/use-favorites';
import { CollectionPicker } from '@/components/favorites/collection-picker';
import { FavoriteButton } from '@/components/favorites/favorite-button';
import {
  useNextProblem,
  usePracticeCacheSync,
  useProblemStats,
  useStartAttempt,
  useSubmitAttempt,
} from '@/hooks/use-practice';
import { OptionRenderer } from './option-renderer';
import { QuestionRenderer } from './question-renderer';
import { SimilarProblems } from './similar-problems';

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

const HISTORY_KEY = 'apteez:problem-history';
const HISTORY_LIMIT = 50;

/** Ids visited this tab, oldest-first — the backbone of Previous. */
function readHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(ids: string[]): void {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(ids.slice(-HISTORY_LIMIT)));
  } catch {
    // Storage unavailable — Previous simply stays disabled.
  }
}

/**
 * Practice surface. Before submission the correct answer does not exist in
 * any API response this component reads, so there is nothing to leak. After
 * submission the server result drives the reveal — correctness is never
 * computed in the browser.
 */
export function PracticeView({ problemId }: { problemId: string }): React.JSX.Element {
  const problem = useProblem(problemId);
  const stats = useProblemStats(problemId);
  const next = useNextProblem(problemId);
  const startAttempt = useStartAttempt(problemId);
  const submitAttempt = useSubmitAttempt(problemId);
  const { syncAfterSubmit } = usePracticeCacheSync();
  const { isAuthenticated } = useAuth();
  const membership = useFavoriteMembership(isAuthenticated ? [problemId] : []);

  const [selected, setSelected] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<AttemptResultDto | null>(null);
  const [previousId, setPreviousId] = React.useState<string | null>(null);
  const startedAtRef = React.useRef<number | null>(null);
  const router = useRouter();

  React.useEffect(() => {
    setSelected(null);
    setResult(null);
    startedAtRef.current = null;
    const history = readHistory();
    const last = history[history.length - 1] ?? null;
    setPreviousId(last && last !== problemId ? last : (history[history.length - 2] ?? null));
    if (last !== problemId) {
      writeHistory([...history, problemId]);
    }
  }, [problemId]);

  const goPrevious = (): void => {
    if (!previousId) {
      return;
    }
    const history = readHistory();
    history.pop();
    writeHistory(history);
    router.push(`/problems/${previousId}`);
  };

  const handleSelect = (optionId: string): void => {
    setSelected(optionId);
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now();
      startAttempt.mutate();
    }
  };

  const handleSubmit = async (): Promise<void> => {
    if (!selected) {
      return;
    }
    let attemptId = startAttempt.data?.id;
    if (!attemptId) {
      const attempt = await startAttempt.mutateAsync();
      attemptId = attempt.id;
    }
    const clientSeconds =
      startedAtRef.current === null
        ? undefined
        : Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
    const outcome = await submitAttempt.mutateAsync({
      attemptId,
      selectedOptionId: selected,
      ...(clientSeconds !== undefined ? { clientTimeSpentSeconds: clientSeconds } : {}),
    });
    setResult(outcome);
    syncAfterSubmit(outcome);
  };

  const resetForRetry = (): void => {
    setSelected(null);
    setResult(null);
    startedAtRef.current = null;
    startAttempt.reset();
    submitAttempt.reset();
  };

  if (problem.isPending) {
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-muted" />
          <div className="h-7 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded bg-muted" />
          <div className="grid gap-2 lg:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (problem.isError || !problem.data) {
    return (
      <ErrorState
        title="Could not load this problem"
        description="It may have been archived, or the library is unreachable right now."
        onRetry={() => void problem.refetch()}
      />
    );
  }

  const data = problem.data;
  const correctId = result?.result.correctOptionId ?? null;
  const isAnswered = result !== null;
  const isCorrect = result?.result.isCorrect ?? false;
  const isFavorited = membership.data?.[0]?.isFavorited ?? data.isFavorited ?? false;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-center gap-2 text-metadata text-subtle-foreground">
            <Link
              href={`/explore?category=${data.category.slug}`}
              className="transition-colors hover:text-foreground"
            >
              {data.category.name}
            </Link>
            {data.topic ? (
              <>
                <span aria-hidden>/</span>
                <span>{data.topic.name}</span>
              </>
            ) : null}
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-section-title text-foreground">{data.title}</h1>
            <div className="flex items-center gap-2">
              <Badge variant={DIFFICULTY_TONE[data.difficulty]}>{data.difficulty}</Badge>
              <Badge
                variant="secondary"
                title={`Rated ${data.rating} (${difficultyForRating(data.rating)})`}
              >
                <span className="font-metric">{data.rating}</span>
                <span className="sr-only"> rated {difficultyForRating(data.rating)}</span>
              </Badge>
            </div>
          </div>

          <QuestionRenderer statement={data.statement} assets={data.assets} />

          <div className="grid gap-2 lg:grid-cols-2" role="group" aria-label="Answer options">
            {data.options.map((option) => {
              const isChosen = isAnswered
                ? result?.result.selectedOptionId === option.id
                : selected === option.id;
              const revealCorrect = isAnswered && correctId === option.id;
              const revealWrong = isAnswered && isChosen && correctId !== option.id;
              return (
                <div key={option.id} className="relative">
                  <OptionRenderer
                    option={option}
                    selected={isChosen || revealCorrect}
                    disabled={isAnswered}
                    onSelect={isAnswered ? undefined : handleSelect}
                    className={cn(
                      revealCorrect && 'border-success bg-success/10',
                      revealWrong && 'border-destructive bg-destructive/10',
                    )}
                  />
                  {revealCorrect ? (
                    <span className="absolute right-3 top-3 text-success" aria-hidden>
                      <Check className="size-4" />
                    </span>
                  ) : null}
                  {revealWrong ? (
                    <span className="absolute right-3 top-3 text-destructive" aria-hidden>
                      <X className="size-4" />
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {isAnswered ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                'flex items-start gap-3 rounded-xl border p-4',
                isCorrect
                  ? 'border-success/40 bg-success/10'
                  : 'border-destructive/40 bg-destructive/10',
              )}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full',
                  isCorrect
                    ? 'bg-success text-success-foreground'
                    : 'bg-destructive text-destructive-foreground',
                )}
              >
                {isCorrect ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <X className="size-4" aria-hidden />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {isCorrect ? 'Correct' : 'Not quite'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {isCorrect
                    ? 'Nice work — this problem now counts as solved.'
                    : 'Review the correct answer and explanation below.'}
                  {result?.result.timeSpentSeconds != null
                    ? ` · ${result.result.timeSpentSeconds}s`
                    : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {selected ? 'Ready to submit' : 'Select an option to continue'}
              </p>
              <Button
                onClick={() => void handleSubmit()}
                disabled={!selected || submitAttempt.isPending}
              >
                {submitAttempt.isPending ? 'Checking…' : 'Submit answer'}
              </Button>
            </div>
          )}

          {submitAttempt.isError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {submitAttempt.error instanceof Error
                ? submitAttempt.error.message
                : 'Submission failed. Try again.'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" aria-label="Question navigation">
        <Button variant="outline" onClick={goPrevious} disabled={!previousId}>
          <ArrowLeft aria-hidden />
          Previous
        </Button>
        {next.data ? (
          <Button asChild>
            <Link href={`/problems/${next.data.id}`}>
              Next problem
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Favorites</p>
            <p className="text-xs text-muted-foreground">
              {isAuthenticated
                ? 'Save this problem or file it into a collection.'
                : 'Sign in to save favorites.'}
            </p>
          </div>
          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <FavoriteButton problemId={problemId} favorited={isFavorited} variant="full" />
              <CollectionPicker problemId={problemId} />
            </div>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/login">Sign in to save</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {isAnswered ? (
        <div className="space-y-3">
          {result?.result.explanation ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <BookOpen className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Explanation</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {result.result.explanation}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {result?.result.shortcut ? (
            <Card>
              <CardContent className="flex items-start gap-3 p-5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Shortcut</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {result.result.shortcut}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={resetForRetry}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft aria-hidden />
              Back
            </Button>
          </div>
        </div>
      ) : null}

      <SimilarProblems problemId={problemId} />
      {stats.data ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-4 p-5">
            <ProgressRing value={stats.data.personalAccuracy ?? 0} size={44} strokeWidth={5} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {stats.data.solved ? 'Solved' : 'Not solved yet'}
              </p>
              <p className="text-xs text-muted-foreground">
                {stats.data.attemptCount} attempt{stats.data.attemptCount === 1 ? '' : 's'} ·{' '}
                {stats.data.personalAccuracy ?? 0}% personal accuracy
                {stats.data.averageTimeSeconds != null
                  ? ` · ~${stats.data.averageTimeSeconds}s average`
                  : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
