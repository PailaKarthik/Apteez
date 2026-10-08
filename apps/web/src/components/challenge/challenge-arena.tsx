'use client';

import { Check, History, Loader2, RefreshCw, Swords, Trophy, X } from 'lucide-react';
import * as React from 'react';
import type { ChallengeMatchedPayload, ChallengeStateDto } from '@apteez/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  Progress,
  SectionHeader,
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

function DuelHero(): React.JSX.Element {
  const stats = useChallengeHistoryStats(undefined);
  const matches = stats.data?.matches ?? 0;
  const winRate = stats.data?.winRate ?? 0;
  const best = stats.data?.bestScore ?? null;
  return (
    <div className="page-enter relative overflow-hidden rounded-3xl border border-border">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.14] via-card to-card" aria-hidden />
      <div className="aurora-field" aria-hidden>
        <span className="aurora-orb -left-14 -top-20 size-64 bg-primary/30" />
        <span className="aurora-orb right-[5%] top-[-50%] size-56 bg-primary/20 [animation-delay:-5s]" />
        <span className="dot-grid absolute inset-0 opacity-60" />
      </div>
      <div className="relative flex flex-col gap-4 p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-xl space-y-2">
          <p className="page-enter inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <span className="live-dot" aria-hidden />
            Head-to-head arena
          </p>
          <h2 className="page-enter-1 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
            Choose your <span className="gradient-text">battlefield</span>
          </h2>
          <p className="page-enter-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Seven aptitude domains. Endless questions. Beat a live opponent to move your rating —
            or warm up solo while matchmaking hunts.
          </p>
        </div>
        <div className="page-enter-2 glass grid w-full max-w-xs shrink-0 grid-cols-3 gap-2 rounded-2xl border border-border p-4 shadow-xl lg:w-72">
          {[
            { label: 'Duels', value: stats.isPending ? '…' : String(matches) },
            { label: 'Win rate', value: stats.isPending ? '…' : `${winRate}%` },
            { label: 'Best', value: stats.isPending ? '…' : best === null ? '—' : String(best) },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className="gradient-text-cool font-metric text-xl font-extrabold">{stat.value}</p>
              <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div
        className="relative h-1 bg-gradient-to-r from-primary via-accent-foreground to-primary"
        aria-hidden
      />
    </div>
  );
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
    return (
      <div>
        <div className="loading-rail mb-3 h-1" aria-hidden>
          <span />
        </div>
        <LoadingState title="Loading challenge domains…" />
      </div>
    );
  }
  if (domains.isError) {
    return <ErrorState title="Could not load domains" onRetry={() => void domains.refetch()} />;
  }
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h3 className="shrink-0 text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Seven battlefields
        </h3>
        <span className="h-px flex-1 bg-gradient-to-r from-primary/30 to-transparent" aria-hidden />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {(domains.data ?? []).map((domain, index) => {
          const empty = domain.problemCount === 0;
          return (
            <div
              key={domain.slug}
              className="animate-fade-up"
              style={{ animationDelay: `${Math.min(index, 6) * 70}ms` }}
            >
              <button
                type="button"
                disabled={isConnecting || empty}
                onClick={() => onSelect(domain.slug)}
                aria-label={`Find opponent in ${domain.name}: ${domain.problemCount} problems, ${Math.round(domain.durationSeconds / 60)} minutes`}
                className="group flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:border-border disabled:hover:shadow-sm"
              >
                <span className="relative shrink-0" aria-hidden>
                  <span className="absolute inset-0 rounded-2xl bg-primary/30 blur-lg opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="icon-tile relative size-14 text-2xl font-extrabold">
                    {domain.name.charAt(0).toUpperCase()}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-base font-bold text-foreground transition-colors group-hover:text-primary">
                      {domain.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-metric text-xs font-bold text-primary">
                      {domain.problemCount}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {Math.round(domain.durationSeconds / 60)} min · endless ·{' '}
                    <span className="font-semibold text-success">+1</span>
                    {' / '}
                    <span className="font-semibold text-destructive">−1</span>
                    {empty ? ' · empty for now' : ''}
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span className="block h-full w-0 rounded-full bg-gradient-to-r from-primary to-accent-foreground transition-[width] duration-500 group-hover:w-full" />
                  </span>
                </span>
                <span
                  className={`flex size-12 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                    empty
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 group-hover:scale-110 group-hover:shadow-xl group-hover:shadow-primary/40'
                  }`}
                  aria-hidden
                >
                  <Swords className="size-5 transition-transform duration-300 group-hover:rotate-12" />
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Rated vs a live opponent · solo run starts automatically if nobody joins · solo is unrated.
        {isConnecting ? (
          <span className="mt-1 flex items-center gap-1.5 font-semibold text-primary" role="status">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            Waiting for the server connection above — pick a battlefield as soon as it lights up.
          </span>
        ) : null}
      </p>
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
    <div className="glass grid grid-cols-3 items-center gap-1 rounded-2xl border border-border p-3 text-center shadow-sm sm:gap-2">
      <div className="min-w-0">
        <p className="flex items-center justify-center gap-1.5 text-metadata uppercase tracking-wide text-subtle-foreground">
          <span className="live-dot" aria-hidden />
          You
        </p>
        <p className="gradient-text-cool font-metric text-xl font-extrabold sm:text-stat">{state.self.scoreboard?.score ?? 0}</p>
        <p className="text-xs text-muted-foreground">
          <span className="text-success">{state.self.scoreboard?.correct ?? 0}✓</span>{' '}
          <span className="text-destructive">{state.self.scoreboard?.wrong ?? 0}✗</span>
        </p>
      </div>
      <div className="text-muted-foreground">
        <p className="text-metadata uppercase tracking-wide text-subtle-foreground">vs</p>
        <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary/10">
          <Swords className="size-5 text-primary" aria-hidden />
        </span>
      </div>
      <div
        className={cn(
          'min-w-0 rounded-xl transition-all duration-500',
          flash ? 'bg-primary/15 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]' : 'bg-transparent',
        )}
      >
        <p className="truncate text-metadata uppercase tracking-wide text-subtle-foreground">
          {state.opponent?.displayName ?? 'Opponent'}
        </p>
        <p className="font-metric text-xl font-bold text-foreground sm:text-stat" aria-live="polite">
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
          <Badge variant={endsIn < 30 ? 'destructive' : 'outline'} className="shrink-0">
            <span className="font-metric tabular-nums">
              {Math.floor(endsIn / 60)}:{String(endsIn % 60).padStart(2, '0')}
            </span>
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
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

      <div key={position} className="animate-fade-up">
      <Card className="overflow-hidden shadow-md">
        <span
          className="block h-1 bg-gradient-to-r from-primary via-accent-foreground to-primary"
          aria-hidden
        />
        <CardContent className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-section-title text-foreground">{state.question.title}</h2>
            <Badge variant={DIFFICULTY_TONE[state.question.difficulty]}>
              {state.question.difficulty}
            </Badge>
          </div>
          <QuestionRenderer statement={state.question.statement} assets={state.question.assets} />
          {/* Single column until lg: two ~300px columns squeeze option text
              and images on phones and small tablets. */}
          <div className="grid gap-2 lg:grid-cols-2" role="group" aria-label="Answer options">
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
              The server is taking longer than usual. Your answer is safe; please don&apos;t
              resubmit.
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
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {!readingReady
                ? `Read the question — answers unlock in ${readingRemaining}s.`
                : answerPending
                  ? 'Answer sent — waiting for the server…'
                  : 'Select an option, then submit.'}
            </p>
            <Button
              onClick={submit}
              disabled={!selected || !canAnswer}
              className="btn-sheen w-full shadow-lg shadow-primary/20 transition-all duration-300 hover:-translate-y-0.5 disabled:hover:translate-y-0 disabled:hover:shadow-none sm:w-auto"
            >
              {answerPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {answerPending ? <span className="typing-dots">Submitting</span> : 'Submit answer'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>

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
  // A finished challenge changes streak, ratings and history everywhere —
  // including the profile rating graph, which reads rating-history.
  React.useEffect(() => {
    if (result.data) {
      invalidateActivityQueries(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['challenge', 'history'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge', 'history-stats'] });
      if (result.data.ratingStatus === 'COMPLETED') {
        void queryClient.invalidateQueries({ queryKey: ['profile', 'rating-history'] });
      }
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

  const oppScore = selfIsPlayer1 ? data.player2.score : data.player1.score;
  const best = Math.max(selfResult.score, oppScore, 1);
  const ratingDelta = data.ratingChange.self ?? 0;

  return (
    <Card
      className={cn(
        'animate-scale-in overflow-hidden',
        won === true && 'gradient-border shadow-xl shadow-success/15',
        won === false && 'border-destructive/25',
      )}
    >
      <CardContent className="relative flex flex-col items-center gap-4 overflow-hidden p-8 text-center">
        <div className="aurora-field" aria-hidden>
          <span
            className={cn(
              'aurora-orb left-[20%] top-[-70%] size-56',
              won === true ? 'bg-success/20' : won === false ? 'bg-destructive/15' : 'bg-primary/20',
            )}
          />
          <span className="aurora-orb right-[15%] top-[-50%] size-52 bg-primary/15 [animation-delay:-6s]" />
        </div>
        <span className="relative" aria-hidden>
          {won === true ? (
            <span className="conic-ring absolute -inset-2 rounded-full opacity-50 blur-[6px]" />
          ) : null}
          <span
            className={cn(
              'relative flex size-20 animate-pop items-center justify-center rounded-full border-2 shadow-xl',
              won === true && 'border-gold/60 bg-gold/15 text-gold shadow-gold/30',
              won === false && 'border-destructive/40 bg-destructive/15 text-destructive',
              won === null && 'border-border bg-muted text-muted-foreground',
            )}
          >
            {won === true ? (
              <Trophy className="size-9" aria-hidden />
            ) : won === false ? (
              <X className="size-9" aria-hidden />
            ) : (
              <Swords className="size-9" aria-hidden />
            )}
          </span>
        </span>
        <div className="relative">
          <h2
            className={cn(
              'text-4xl font-extrabold tracking-tight sm:text-5xl',
              won === true && 'gradient-text-gold',
              won === false && 'text-foreground',
              won === null && 'text-foreground',
            )}
          >
            {won === true ? 'Victory' : won === false ? 'Defeat' : 'Draw'}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {state.domainName} · {data.completionReason ?? 'COMPLETED'}
          </p>
        </div>

        <div className="relative w-full max-w-md space-y-2.5 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
          {[
            { label: 'You', score: selfResult.score, correct: selfResult.correct, wrong: selfResult.wrong, highlight: true },
            {
              label: state.opponent?.displayName ?? 'Opponent',
              score: oppScore,
              correct: selfIsPlayer1 ? data.player2.correct : data.player1.correct,
              wrong: selfIsPlayer1 ? data.player2.wrong : data.player1.wrong,
              highlight: false,
            },
          ].map((row) => (
            <div key={row.label} className="space-y-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="min-w-0 truncate font-semibold text-foreground">{row.label}</span>
                <span className="font-metric text-base font-extrabold text-foreground">
                  {row.score}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {row.correct}✓ {row.wrong}✗
                  </span>
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div
                  className={cn(
                    'h-full rounded-full transition-[width] duration-1000',
                    row.highlight
                      ? 'bg-gradient-to-r from-primary to-accent-foreground shadow-[0_0_12px_hsl(var(--primary)/0.6)]'
                      : 'bg-muted-foreground/40',
                  )}
                  style={{ width: `${Math.max(4, Math.round((row.score / best) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        {data.ratingStatus === 'COMPLETED' && !data.isSolo ? (
          <div className="relative flex w-full max-w-md flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-elevated p-5 sm:flex-row sm:gap-8">
            <div className="text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Rating change
              </p>
              <p
                className={cn(
                  'animate-pop font-metric text-4xl font-extrabold',
                  ratingDelta > 0
                    ? 'text-success drop-shadow-[0_0_16px_hsl(var(--success)/0.5)]'
                    : ratingDelta < 0
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
            <span className="hidden h-12 w-px bg-border sm:block" aria-hidden />
            <div className="text-center">
              <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                Opponent
              </p>
              <p className="font-metric text-xl font-bold text-muted-foreground">
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

        <Button
          onClick={onPlayAgain}
          size="lg"
          className="btn-sheen relative shadow-xl shadow-primary/25 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary/30"
        >
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
      <Card className="animate-scale-in overflow-hidden">
        <div className="loading-rail h-1" aria-hidden>
          <span />
        </div>
        <CardContent className="relative flex flex-col items-center gap-4 overflow-hidden p-10 text-center">
          <div className="aurora-field" aria-hidden>
            <span className="aurora-orb left-[10%] top-[-60%] size-48 bg-primary/20" />
            <span className="aurora-orb right-[5%] top-[20%] size-48 bg-primary/15 [animation-delay:-6s]" />
          </div>
          <span className="relative flex size-16 items-center justify-center rounded-full border border-primary/25 bg-primary/10 shadow-lg shadow-primary/20" aria-hidden>
            <Swords className="size-7 text-primary" />
          </span>
          <div className="relative">
            <p className="text-section-title text-foreground">Finding an opponent…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Matching you with a player near your rating. If nobody joins shortly, a solo run
              starts automatically.
            </p>
          </div>
          <Button variant="outline" onClick={challenge.cancelMatchmaking} className="relative">
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
      <DuelHero />
      {!connected ? (
        <div
          role="status"
          aria-live="polite"
          className="animate-fade-in relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-r from-primary/[0.12] via-card to-primary/[0.08] p-4 shadow-lg shadow-primary/15"
        >
          <div className="loading-rail mb-3 h-1.5" aria-hidden>
            <span />
          </div>
          <div className="flex items-center gap-3">
            <span className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15" aria-hidden>
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">
                <span className="typing-dots">Connecting to the challenge server</span>
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                Waking up the live matchmaking server — after a deploy this can take
                ~30 seconds (cold start). Domains unlock the moment we&apos;re connected;
                please wait.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-primary/40"
              onClick={() => challenge.connect()}
            >
              <RefreshCw aria-hidden />
              Retry
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="animate-fade-in rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}
      <DomainPicker onSelect={challenge.startMatchmaking} isConnecting={!connected} />
    </div>
  );
}

/**
 * Proper 5→4→3→2→1→GO countdown. The lightweight MATCHED payload enters this
 * panel instantly; the full state hydrates it right after.
 *
 * Honesty rule: "GO!" renders ONLY once the full state arrived. The digit
 * countdown runs on the lightweight payload's clock, but the game itself
 * starts when the server says LIVE with questions — showing GO! before that
 * stranded players on a dead screen whenever the state snapshot was slow.
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

  const opponentInitial = opponentName.trim().charAt(0).toUpperCase() || '?';
  return (
    <Card className="animate-scale-in gradient-border overflow-hidden shadow-xl shadow-primary/15">
      <CardContent className="relative flex flex-col items-center gap-4 overflow-hidden p-6 text-center sm:p-10">
        <div className="aurora-field" aria-hidden>
          <span className="aurora-orb left-[15%] top-[-70%] size-56 bg-primary/25" />
          <span className="aurora-orb right-[10%] top-[-30%] size-52 bg-primary/15 [animation-delay:-6s]" />
          <span className="dot-grid absolute inset-0 opacity-50" />
        </div>
        <Badge variant="success" className="relative flex items-center gap-1.5 shadow-lg shadow-success/25">
          <Check className="size-3" aria-hidden />
          {isSolo ? 'Solo run ready' : 'Opponent found'}
        </Badge>
        <div className="relative flex w-full max-w-sm items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border border-border bg-card/80 p-3 backdrop-blur">
            <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-accent/60 font-metric text-lg font-extrabold text-primary" aria-hidden>
              {opponentInitial}
            </span>
            <p className="w-full truncate text-sm font-bold text-foreground">{opponentName}</p>
            <span className="rounded-full bg-muted/70 px-2 py-0.5 font-metric text-xs font-semibold text-muted-foreground">
              {opponentRating} rated
            </span>
          </div>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-metric text-xs font-extrabold text-primary-foreground shadow-lg shadow-primary/40" aria-hidden>
            VS
          </span>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-2xl border border-primary/40 bg-primary/[0.07] p-3 backdrop-blur">
            <span className="flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-foreground font-metric text-lg font-extrabold text-white shadow-md shadow-primary/30" aria-hidden>
              You
            </span>
            <p className="w-full truncate text-sm font-bold text-foreground">You</p>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 font-metric text-xs font-bold text-primary">
              locked in
            </span>
          </div>
        </div>
        <div className="relative flex h-28 items-center justify-center sm:h-32" aria-live="polite">
          <span className="conic-ring absolute size-28 rounded-full opacity-25 blur-md sm:size-32" aria-hidden />
          {display > 0 ? (
            <span
              key={display}
              className="gradient-text font-metric relative inline-block text-7xl font-extrabold tabular-nums animate-[countdown-pop_0.9s_ease-out] sm:text-8xl"
            >
              {display}
            </span>
          ) : hydrating ? (
            <span className="relative flex items-center gap-3 text-xl font-semibold text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
              Starting…
            </span>
          ) : (
            <span
              key="go"
              className="gradient-text font-metric relative inline-block text-7xl font-extrabold animate-[countdown-pop_0.9s_ease-out] sm:text-8xl"
            >
              GO!
            </span>
          )}
        </div>
        <div className="relative w-full max-w-xs space-y-2">
          <Progress
            value={display > 0 ? ((total - display + 1) / (total + 1)) * 100 : 100}
            className="w-full shadow-[0_0_20px_-6px_hsl(var(--primary)/0.6)]"
          />
          <div className="loading-rail h-1" aria-hidden>
            <span />
          </div>
        </div>
        <p className="relative text-sm text-muted-foreground">
          Endless questions · {minutes} {minutes === 1 ? 'minute' : 'minutes'} ·{' '}
          <span aria-hidden>
            <span className="font-semibold text-success">+1</span> correct /{' '}
            <span className="font-semibold text-destructive">−1</span> wrong
          </span>
          <span className="sr-only">+1 correct / −1 wrong</span>
          {isSolo ? ' · unrated solo' : ''}
        </p>
        {hydrating ? (
          <p className="relative flex items-center gap-2 text-xs text-muted-foreground" role="status">
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy="true" aria-label="Loading stats">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index} className="animate-fade-up overflow-hidden" style={{ animationDelay: `${index * 70}ms` }} aria-hidden>
              <CardContent className="space-y-2 p-4 text-center">
                <div className="skeleton-shine mx-auto h-3 w-16 rounded-md" />
                <div className="skeleton-shine mx-auto h-7 w-20 rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats.isError || !stats.data ? (
        <ErrorState title="Could not load stats" onRetry={() => void stats.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: 'Matches',
              body: <p className="font-metric text-stat text-foreground">{stats.data.matches}</p>,
              wash: 'from-primary/15 to-transparent',
            },
            {
              label: 'W · L · D',
              body: (
                <>
                  <p className="font-metric text-stat text-foreground">
                    {stats.data.wins} · {stats.data.losses} · {stats.data.draws}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-metric">{stats.data.winRate}%</span> win rate
                  </p>
                </>
              ),
              wash: 'from-success/15 to-transparent',
            },
            {
              label: 'Best score',
              body: (
                <>
                  <p className="gradient-text-gold font-metric text-stat font-extrabold">{stats.data.bestScore ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    avg <span className="font-metric">{stats.data.avgScore ?? '—'}</span>
                  </p>
                </>
              ),
              wash: 'from-gold/15 to-transparent',
            },
            {
              label: 'Answers',
              body: (
                <p className="font-metric text-stat text-foreground">
                  <span className="text-success">{stats.data.totalCorrect}✓</span>{' '}
                  <span className="text-destructive">{stats.data.totalWrong}✗</span>
                </p>
              ),
              wash: 'from-primary/10 to-transparent',
            },
          ].map((stat, index) => (
            <Card
              key={stat.label}
              className="card-lift animate-fade-up relative overflow-hidden"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.wash}`} aria-hidden />
              <CardContent className="relative space-y-1 p-4 text-center">
                <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                  {stat.label}
                </p>
                {stat.body}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!stats.isPending && !stats.isError && stats.data && stats.data.matches > 0 ? (
        <div className="animate-fade-in space-y-1.5 rounded-2xl border border-border bg-card p-4" aria-label="Win loss record">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span
              className="bg-success transition-[width] duration-1000"
              style={{ width: `${(stats.data.wins / stats.data.matches) * 100}%` }}
            />
            <span
              className="bg-muted-foreground/50 transition-[width] duration-1000"
              style={{ width: `${(stats.data.draws / stats.data.matches) * 100}%` }}
            />
            <span
              className="bg-destructive/70 transition-[width] duration-1000"
              style={{ width: `${(stats.data.losses / stats.data.matches) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span><span className="font-metric font-bold text-success">{stats.data.wins}</span> won</span>
            <span><span className="font-metric font-bold">{stats.data.draws}</span> drawn</span>
            <span><span className="font-metric font-bold text-destructive">{stats.data.losses}</span> lost</span>
          </div>
        </div>
      ) : null}

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
            {history.data.items.map((entry, index) => (
              <li
                key={entry.id}
                className="row-enter"
                style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
              >
                <Card className="card-lift">
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
