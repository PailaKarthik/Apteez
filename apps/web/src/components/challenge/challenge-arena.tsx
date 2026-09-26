'use client';

import { Check, History, Loader2, RefreshCw, Swords, TriangleAlert, Trophy, X } from 'lucide-react';
import * as React from 'react';
import type { ChallengeMatchedPayload, ChallengeStateDto } from '@apteez/types';
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
  Pagination,
  Progress,
  SectionHeader,
  Skeleton,
  cn,
} from '@apteez/ui';
import { OptionRenderer } from '@/components/problems/option-renderer';
import { QuestionRenderer } from '@/components/problems/question-renderer';
import {
  CHALLENGE_HISTORY_PAGE_SIZE,
  useChallenge,
  useChallengeDomains,
  useChallengeHistoryPage,
  useChallengeHistoryStats,
  useChallengeResult,
} from '@/hooks/use-challenge';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import { invalidateActivityQueries } from '@/lib/invalidate-activity';

const DIFFICULTY_TONE = { EASY: 'success', MEDIUM: 'warning', HARD: 'destructive' } as const;

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
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [target]);

  return remaining;
}

function DomainPicker({
  onSelect,
  isConnecting,
}: {
  onSelect: (slug: string) => void;
  isConnecting: boolean;
}): React.JSX.Element {
  const domains = useChallengeDomains();
  if (domains.isPending) {
    return <LoadingState title="Loading challenge domains…" />;
  }
  if (domains.isError) {
    return <ErrorState title="Could not load domains" onRetry={() => void domains.refetch()} />;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {(domains.data ?? []).map((domain) => (
        <Card key={domain.slug} className="transition-colors hover:border-primary/50">
          <CardContent className="flex h-full flex-col gap-2 p-5">
            <div className="flex items-center justify-between">
              <CardTitle className="text-card-title">{domain.name}</CardTitle>
              <Badge variant="secondary">
                <span className="font-metric">{domain.problemCount}</span>
              </Badge>
            </div>
            <CardDescription>
              {Math.round(domain.durationSeconds / 60)} min · endless questions · +1 / −1
            </CardDescription>
            <p className="text-xs text-muted-foreground">
              Rated vs a live opponent · solo bot run if nobody joins · solo is unrated
            </p>
            <Button
              className="mt-auto"
              disabled={isConnecting || domain.problemCount === 0}
              onClick={() => onSelect(domain.slug)}
            >
              <Swords aria-hidden />
              Find opponent
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Scoreboard({ state }: { state: ChallengeStateDto }): React.JSX.Element {
  // Flash the opponent column when a live progress push lands, so score
  // changes are noticeable the instant they arrive.
  const opponentScore = state.opponent?.score ?? 0;
  const prevScoreRef = React.useRef(opponentScore);
  const [flash, setFlash] = React.useState(false);
  React.useEffect(() => {
    if (opponentScore !== prevScoreRef.current) {
      prevScoreRef.current = opponentScore;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [opponentScore]);

  return (
    <div className="grid grid-cols-3 items-center gap-2 rounded-xl border border-border bg-elevated p-3 text-center">
      <div>
        <p className="text-metadata uppercase tracking-wide text-subtle-foreground">You</p>
        <p className="font-metric text-stat text-foreground">{state.self.scoreboard?.score ?? 0}</p>
        <p className="text-xs text-muted-foreground">
          {state.self.scoreboard?.correct ?? 0}✓ {state.self.scoreboard?.wrong ?? 0}✗
        </p>
      </div>
      <div className="text-muted-foreground">
        <p className="text-metadata uppercase tracking-wide text-subtle-foreground">vs</p>
        <Swords className="mx-auto size-5" aria-hidden />
      </div>
      <div
        className={cn('rounded-lg transition-colors', flash ? 'bg-primary/10' : 'bg-transparent')}
      >
        <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
          {state.opponent?.displayName ?? 'Opponent'}
        </p>
        <p className="font-metric text-stat text-foreground" aria-live="polite">
          {opponentScore}
        </p>
        <p className="text-xs text-muted-foreground">
          {state.opponent?.answeredCount ?? 0} answered
        </p>
      </div>
    </div>
  );
}

function LiveChallenge({
  state,
  answerPending,
  answerSlow,
  answerError,
  onSubmit,
  onQuit,
}: {
  state: ChallengeStateDto;
  answerPending: boolean;
  answerSlow: boolean;
  answerError: string | null;
  onSubmit: (input: {
    challengeId: string;
    position: number;
    selectedOptionId: string;
    clientElapsedMs?: number;
  }) => void;
  onQuit: () => void;
}): React.JSX.Element {
  const [selected, setSelected] = React.useState<string | null>(null);
  const askedAtRef = React.useRef(Date.now());

  const endsIn = useCountdown(state.endsAt, state.serverTime);
  const position = state.self.answeredCount;
  // Server-derived unlock moment; the display timer only mirrors it.
  const readingRemaining = useCountdown(state.question?.answerableAt ?? null, state.serverTime);
  const readingReady = readingRemaining === 0;
  const canAnswer = readingReady && !answerPending;
  const timeUp = endsIn === 0;

  React.useEffect(() => {
    setSelected(null);
    askedAtRef.current = Date.now();
  }, [position]);

  const submit = (): void => {
    if (!selected || !state.question || answerPending) {
      return;
    }
    onSubmit({
      challengeId: state.id,
      position: state.question.position,
      selectedOptionId: selected,
      clientElapsedMs: Date.now() - askedAtRef.current,
    });
  };

  if (!state.question) {
    return (
      <Card>
        <CardContent className="p-6">
          <LoadingState title="Waiting for the next question…" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            Question <span className="font-metric">{position + 1}</span>
          </Badge>
          {state.isSolo ? (
            <Badge variant="outline" title="Solo runs are unrated">
              Solo · unrated
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={endsIn < 30 ? 'destructive' : 'outline'}>
            <span className="font-metric">
              {Math.floor(endsIn / 60)}:{String(endsIn % 60).padStart(2, '0')}
            </span>
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm('Quit this match? Quitting a live match forfeits it.')) {
                onQuit();
              }
            }}
          >
            Quit
          </Button>
        </div>
      </div>

      <Scoreboard state={state} />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-section-title text-foreground">{state.question.title}</h2>
            <Badge variant={DIFFICULTY_TONE[state.question.difficulty]}>
              {state.question.difficulty}
            </Badge>
          </div>
          <QuestionRenderer statement={state.question.statement} assets={state.question.assets} />
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Answer options">
            {state.question.options.map((option) => (
              <OptionRenderer
                key={option.id}
                option={option}
                selected={selected === option.id}
                disabled={!canAnswer}
                onSelect={setSelected}
              />
            ))}
          </div>
          {answerSlow ? (
            <p
              role="status"
              className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              The server is taking longer than usual — the database is waking up. Your answer is
              safe; please don&apos;t resubmit.
            </p>
          ) : null}
          {answerError ? (
            <p
              role="alert"
              className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {answerError} Tap Submit to try again.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {!readingReady
                ? `Read the question — answers unlock in ${readingRemaining}s.`
                : answerPending
                  ? 'Answer sent — waiting for the server…'
                  : 'Select an option, then submit.'}
            </p>
            <Button onClick={submit} disabled={!selected || !canAnswer}>
              {answerPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {answerPending ? 'Submitting…' : 'Submit answer'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {timeUp ? (
        <div
          role="status"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-background/85 text-center backdrop-blur-sm"
        >
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <p className="text-section-title text-foreground">Time&apos;s up!</p>
          <p className="text-sm text-muted-foreground">Checking results…</p>
        </div>
      ) : null}
    </div>
  );
}

/** Shown between the timer hitting zero and the finalized result arriving. */
function FinalizingPanel(): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <div>
          <p className="text-section-title text-foreground">Checking results…</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The timer ended — tallying final scores. This can take a few seconds on a cold server.
          </p>
        </div>
        <ul className="w-full max-w-xs space-y-2 text-left text-sm">
          <li className="flex items-center gap-2 text-muted-foreground">
            <Check className="size-4 text-success" aria-hidden /> Answers locked in
          </li>
          <li className="flex items-center gap-2 text-foreground">
            <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> Tallying final
            scores…
          </li>
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="size-4 rounded-full border border-border" aria-hidden /> Winner &
            rating next
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function CheckingResults(): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
        <div>
          <p className="text-section-title text-foreground">Checking results…</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Fetching the final scores — no winner yet, hold on.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultPanel({
  state,
  onPlayAgain,
}: {
  state: ChallengeStateDto;
  onPlayAgain: () => void;
}): React.JSX.Element {
  const result = useChallengeResult(state.id, true);
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = React.useState(false);
  const retryRating = async (): Promise<void> => {
    if (retrying) {
      return;
    }
    setRetrying(true);
    try {
      // Synchronous server-side retry: resets the attempt counter and
      // processes immediately instead of hoping the queue gets to it.
      await apiFetch(`/challenges/${state.id}/rating/retry`, { method: 'POST' });
    } catch {
      // The refetch below surfaces the honest state either way.
    } finally {
      await result.refetch();
      setRetrying(false);
    }
  };
  // A finished challenge changes streak, ratings and history everywhere.
  React.useEffect(() => {
    if (result.data) {
      invalidateActivityQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['challenge', 'history'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', 'history-stats'] });
    }
  }, [result.data, queryClient]);

  // No verdict until the authoritative result loads: deriving win/loss from an
  // absent outcome briefly crowned the wrong player on both screens.
  if (result.isPending) {
    return <CheckingResults />;
  }
  if (result.isError || !result.data) {
    return (
      <Card>
        <CardContent className="p-6">
          <ErrorState title="Could not load the result" onRetry={() => void result.refetch()} />
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={onPlayAgain}>
              <Swords aria-hidden />
              Play again
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = result.data;
  const outcome = data.outcome;
  const selfIsPlayer1 = data.player1.id === state.self.id;
  const selfResult = selfIsPlayer1 ? data.player1 : data.player2;
  const won =
    outcome === 'DRAW' ? null : outcome === 'PLAYER1_WIN' ? selfIsPlayer1 : !selfIsPlayer1;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full',
            won === true && 'bg-success/15 text-success',
            won === false && 'bg-destructive/15 text-destructive',
            won === null && 'bg-muted text-muted-foreground',
          )}
        >
          {won === true ? (
            <Trophy className="size-7" aria-hidden />
          ) : won === false ? (
            <X className="size-7" aria-hidden />
          ) : (
            <Swords className="size-7" aria-hidden />
          )}
        </span>
        <div>
          <h2 className="text-page-title text-foreground">
            {won === true ? 'Victory' : won === false ? 'Defeat' : 'Draw'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.domainName} · {data.completionReason ?? 'COMPLETED'}
          </p>
        </div>

        <div className="grid w-full max-w-md grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-elevated p-4">
            <p className="text-metadata uppercase tracking-wide text-subtle-foreground">You</p>
            <p className="font-metric text-stat text-foreground">{selfResult.score}</p>
            <p className="text-xs text-muted-foreground">
              {selfResult.correct}✓ {selfResult.wrong}✗ {selfResult.unanswered}–
            </p>
          </div>
          <div className="rounded-xl border border-border bg-elevated p-4">
            <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
              {state.opponent?.displayName ?? 'Opponent'}
            </p>
            <p className="font-metric text-stat text-foreground">
              {selfIsPlayer1 ? data.player2.score : data.player1.score}
            </p>
            <p className="text-xs text-muted-foreground">
              {selfIsPlayer1 ? data.player2.correct : data.player1.correct}✓{' '}
              {selfIsPlayer1 ? data.player2.wrong : data.player1.wrong}✗
            </p>
          </div>
        </div>
        {data.ratingStatus === 'COMPLETED' && !data.isSolo ? (
          <div className="flex w-full max-w-md items-center justify-center gap-6 rounded-xl border border-border bg-elevated p-4">
            <div className="text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Your rating
              </p>
              <p
                className={cn(
                  'font-metric text-stat',
                  (data.ratingChange.self ?? 0) > 0
                    ? 'text-success'
                    : (data.ratingChange.self ?? 0) < 0
                      ? 'text-destructive'
                      : 'text-foreground',
                )}
              >
                {data.ratingChange.self === null
                  ? '—'
                  : data.ratingChange.self > 0
                    ? `+${data.ratingChange.self}`
                    : data.ratingChange.self}
              </p>
            </div>
            <div className="text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Opponent
              </p>
              <p className="font-metric text-stat text-muted-foreground">
                {data.ratingChange.opponent === null
                  ? '—'
                  : data.ratingChange.opponent > 0
                    ? `+${data.ratingChange.opponent}`
                    : data.ratingChange.opponent}
              </p>
            </div>
          </div>
        ) : data.isSolo ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Solo run — scores count, ratings don&apos;t move.
          </p>
        ) : data.ratingStatus === 'FAILED' ? (
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-border bg-elevated p-4">
            <p className="text-xs text-muted-foreground" role="alert">
              Rating could not be processed — your result above is final and safe.
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={() => void retryRating()}
            >
              {retrying ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <RefreshCw aria-hidden />
              )}
              {retrying ? 'Retrying…' : 'Retry rating'}
            </Button>
          </div>
        ) : (
          <p
            className="flex items-center gap-2 text-xs text-muted-foreground"
            aria-live="polite"
            role="status"
          >
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Rating is being processed… it lands automatically.
          </p>
        )}

        <Button onClick={onPlayAgain}>
          <Swords aria-hidden />
          Play again
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The full 1v1 challenge flow: domain selection → matchmaking → countdown →
 * live questions → result. All authoritative state arrives from the server
 * over the socket; this component only renders it.
 */
export function ChallengeArena(): React.JSX.Element {
  const challenge = useChallenge();
  const { phase, state, matched, connected, error, answerPending, answerSlow, answerError } =
    challenge;

  // Leaving the page means leaving the game: cancel a search, forfeit a live
  // run (server records the winner). A plain disconnect (tab closed) instead
  // gets the reconnect grace period via the socket close handler.
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;
  const cancelMatchmaking = challenge.cancelMatchmaking;
  const leave = challenge.leave;
  React.useEffect(
    () => () => {
      const current = phaseRef.current;
      if (current === 'searching') {
        cancelMatchmaking();
      } else if (current === 'countdown' || current === 'live' || current === 'finalizing') {
        leave();
      }
    },
    [cancelMatchmaking, leave],
  );

  if (phase === 'searching') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <div>
            <p className="text-section-title text-foreground">Finding an opponent…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Matching you with a player near your rating. If nobody joins shortly, a solo run
              starts automatically.
            </p>
          </div>
          <Button variant="outline" onClick={challenge.cancelMatchmaking}>
            Cancel search
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === 'countdown' && (state || matched)) {
    return <CountdownPanel state={state} matched={matched} />;
  }

  if (phase === 'live' && state) {
    return (
      <LiveChallenge
        state={state}
        answerPending={answerPending}
        answerSlow={answerSlow}
        answerError={answerError}
        onSubmit={challenge.submitAnswer}
        onQuit={challenge.leave}
      />
    );
  }

  if (phase === 'finalizing') {
    return <FinalizingPanel />;
  }

  if (phase === 'completed' && state) {
    return <ResultPanel state={state} onPlayAgain={challenge.reset} />;
  }

  if (phase === 'cancelled') {
    return (
      <EmptyState
        title="Challenge cancelled"
        description="The duel ended before it started. Pick a domain to try again."
        action={<Button onClick={challenge.reset}>Choose a domain</Button>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!connected ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5" aria-hidden />
          Connecting to the challenge server…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <DomainPicker onSelect={challenge.startMatchmaking} isConnecting={!connected} />
    </div>
  );
}

/**
 * Proper 5→4→3→2→1→GO countdown. The lightweight MATCHED payload enters this
 * panel instantly; the full state hydrates it right after (a "preparing"
 * note covers slow servers honestly instead of a stuck digit).
 */
function CountdownPanel({
  state,
  matched,
}: {
  state: ChallengeStateDto | null;
  matched: ChallengeMatchedPayload | null;
}): React.JSX.Element {
  const target = state?.countdownEndsAt ?? matched?.countdownEndsAt ?? null;
  const serverTime = state?.serverTime ?? matched?.serverTime ?? null;
  const seconds = useCountdown(target, serverTime);
  const total = state?.config.countdownSeconds ?? 5;
  const display = Math.min(seconds, total);
  const isSolo = state?.isSolo ?? matched?.isSolo ?? false;
  const opponentName = state?.opponent?.displayName ?? matched?.opponent.displayName ?? 'Opponent';
  const opponentRating = state?.opponent?.rating ?? matched?.opponent.rating ?? 1000;
  const minutes = Math.max(1, Math.round((state?.config.durationSeconds ?? 120) / 60));
  const hydrating = !state;

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <Badge variant="success">
          <Check className="size-3" aria-hidden />
          {isSolo ? 'Solo run ready' : 'Opponent found'}
        </Badge>
        <p className="text-section-title text-foreground">
          {opponentName}
          <span className="font-metric ml-2 text-muted-foreground">{opponentRating}</span>
        </p>
        <div className="flex h-24 items-center justify-center" aria-live="polite">
          <span
            key={display}
            className="font-metric inline-block text-7xl font-extrabold text-primary animate-[countdown-pop_0.9s_ease-out]"
          >
            {display > 0 ? display : 'GO!'}
          </span>
        </div>
        <Progress
          value={display > 0 ? ((total - display + 1) / (total + 1)) * 100 : 100}
          className="w-full max-w-xs"
        />
        <p className="text-sm text-muted-foreground">
          Endless questions · {minutes} {minutes === 1 ? 'minute' : 'minutes'} · +1 correct / −1
          wrong{isSolo ? ' · unrated solo' : ''}
        </p>
        {hydrating ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Preparing your questions — the game starts on time regardless.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

const RESULT_TONE = { WIN: 'success', LOSS: 'destructive', DRAW: 'secondary' } as const;

/** Paginated match history with analytics, shown under the arena. */
export function ChallengeHistorySection(): React.JSX.Element {
  const [page, setPage] = React.useState(1);
  const [domain, setDomain] = React.useState<string>('all');
  const activeDomain = domain === 'all' ? undefined : domain;

  const domains = useChallengeDomains();
  const stats = useChallengeHistoryStats(activeDomain);
  const history = useChallengeHistoryPage(
    (page - 1) * CHALLENGE_HISTORY_PAGE_SIZE,
    CHALLENGE_HISTORY_PAGE_SIZE,
    activeDomain,
  );

  const total = history.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / CHALLENGE_HISTORY_PAGE_SIZE));
  // Clamp the page when a filter shrinks the result set beneath it.
  React.useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const selectDomain = (slug: string): void => {
    setDomain(slug);
    setPage(1);
  };

  return (
    <section aria-label="Challenge history" className="space-y-4">
      <SectionHeader
        title="Match history"
        description="Every rated duel and solo run, newest first."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={history.isPending}
            onClick={() => {
              void history.refetch();
              void stats.refetch();
            }}
          >
            <RefreshCw aria-hidden />
            Refresh
          </Button>
        }
      />

      {(domains.data?.length ?? 0) > 1 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by domain">
          <Button
            variant={domain === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => selectDomain('all')}
          >
            All domains
          </Button>
          {(domains.data ?? []).map((entry) => (
            <Button
              key={entry.slug}
              variant={domain === entry.slug ? 'default' : 'outline'}
              size="sm"
              onClick={() => selectDomain(entry.slug)}
            >
              {entry.name}
            </Button>
          ))}
        </div>
      ) : null}

      {stats.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : stats.isError || !stats.data ? (
        <ErrorState title="Could not load stats" onRetry={() => void stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Matches
              </p>
              <p className="font-metric text-stat text-foreground">{stats.data.matches}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                W · L · D
              </p>
              <p className="font-metric text-stat text-foreground">
                {stats.data.wins} · {stats.data.losses} · {stats.data.draws}
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-metric">{stats.data.winRate}%</span> win rate
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Best score
              </p>
              <p className="font-metric text-stat text-foreground">{stats.data.bestScore ?? '—'}</p>
              <p className="text-xs text-muted-foreground">
                avg <span className="font-metric">{stats.data.avgScore ?? '—'}</span>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Answers
              </p>
              <p className="font-metric text-stat text-foreground">
                <span className="text-success">{stats.data.totalCorrect}✓</span>{' '}
                <span className="text-destructive">{stats.data.totalWrong}✗</span>
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {history.isPending ? (
        <LoadingState title="Loading match history…" />
      ) : history.isError || !history.data ? (
        <ErrorState title="Could not load match history" onRetry={() => void history.refetch()} />
      ) : history.data.items.length === 0 ? (
        <EmptyState
          icon={History}
          title="No matches yet"
          description="Duel an opponent or run a solo above — every finished game lands here."
        />
      ) : (
        <div className={cn('space-y-2', history.isFetching ? 'opacity-70' : null)}>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Showing{' '}
            <span className="font-metric">
              {(page - 1) * CHALLENGE_HISTORY_PAGE_SIZE + 1}–
              {(page - 1) * CHALLENGE_HISTORY_PAGE_SIZE + history.data.items.length}
            </span>{' '}
            of <span className="font-metric">{total}</span>
            {history.isFetching ? ' · updating…' : ''}
          </p>
          <ul className="space-y-2">
            {history.data.items.map((entry) => (
              <li key={entry.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <Badge variant={RESULT_TONE[entry.result]}>{entry.result}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {entry.domainName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        vs {entry.opponent.displayName} ·{' '}
                        {new Date(entry.playedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {entry.completionReason !== 'COMPLETED' &&
                        entry.completionReason !== 'TIMER_EXPIRED'
                          ? ` · ${entry.completionReason}`
                          : ''}
                      </p>
                    </div>
                    {entry.isSolo ? <Badge variant="outline">Solo</Badge> : null}
                    <p className="font-metric text-sm text-foreground">
                      {entry.selfScore} – {entry.opponentScore}
                    </p>
                    {!entry.isSolo ? (
                      <p
                        className={cn(
                          'font-metric w-12 text-right text-sm',
                          (entry.ratingChange ?? 0) > 0
                            ? 'text-success'
                            : (entry.ratingChange ?? 0) < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground',
                        )}
                        title={entry.ratingChange === null ? 'Rating pending' : 'Rating change'}
                      >
                        {entry.ratingChange === null
                          ? '—'
                          : entry.ratingChange > 0
                            ? `+${entry.ratingChange}`
                            : entry.ratingChange}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </section>
  );
}
