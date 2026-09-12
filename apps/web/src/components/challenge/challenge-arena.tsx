'use client';

import { Check, Loader2, Swords, TriangleAlert, Trophy, X } from 'lucide-react';
import * as React from 'react';
import type { ChallengeStateDto } from '@apteez/types';
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
  cn,
} from '@apteez/ui';
import { OptionRenderer } from '@/components/problems/option-renderer';
import { QuestionRenderer } from '@/components/problems/question-renderer';
import { useChallenge, useChallengeDomains, useChallengeResult } from '@/hooks/use-challenge';

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
            <CardDescription>1v1 rated duels · rating starts at 1000</CardDescription>
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
      <div>
        <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
          {state.opponent?.displayName ?? 'Opponent'}
        </p>
        <p className="font-metric text-stat text-foreground">{state.opponent?.score ?? 0}</p>
        <p className="text-xs text-muted-foreground">
          {state.opponent?.answeredCount ?? 0} answered
        </p>
      </div>
    </div>
  );
}

function LiveChallenge({
  state,
  onSubmit,
}: {
  state: ChallengeStateDto;
  onSubmit: (input: {
    challengeId: string;
    position: number;
    selectedOptionId: string;
    clientElapsedMs?: number;
  }) => void;
}): React.JSX.Element {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [locked, setLocked] = React.useState(false);
  const askedAtRef = React.useRef(Date.now());

  const endsIn = useCountdown(state.endsAt, state.serverTime);
  const position = state.self.answeredCount;
  // Server-derived unlock moment; the display timer only mirrors it.
  const readingRemaining = useCountdown(state.question?.answerableAt ?? null, state.serverTime);
  const readingReady = readingRemaining === 0;
  const canAnswer = readingReady && !locked;

  React.useEffect(() => {
    setSelected(null);
    setLocked(false);
    askedAtRef.current = Date.now();
  }, [position]);

  const submit = (): void => {
    if (!selected || !state.question) {
      return;
    }
    setLocked(true);
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Badge variant="secondary">
          Question <span className="font-metric">{position + 1}</span> /{' '}
          <span className="font-metric">{state.questionCount}</span>
        </Badge>
        <Badge variant={endsIn < 30 ? 'destructive' : 'outline'}>
          <span className="font-metric">
            {Math.floor(endsIn / 60)}:{String(endsIn % 60).padStart(2, '0')}
          </span>
        </Badge>
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
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {!readingReady
                ? `Read the question — answers unlock in ${readingRemaining}s.`
                : locked
                  ? 'Answer sent — waiting for the server…'
                  : 'Select an option, then submit.'}
            </p>
            <Button onClick={submit} disabled={!selected || locked || !canAnswer}>
              {locked ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Submit answer
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
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
  const outcome = result.data?.outcome;
  const selfIsPlayer1 = result.data?.player1.id === state.self.id;
  const selfResult = result.data
    ? selfIsPlayer1
      ? result.data.player1
      : result.data.player2
    : null;
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
            {state.domainName} · {result.data?.completionReason ?? 'COMPLETED'}
          </p>
        </div>

        {result.isPending ? (
          <LoadingState title="Loading final scores…" />
        ) : result.isError || !result.data || !selfResult ? (
          <ErrorState title="Could not load the result" onRetry={() => void result.refetch()} />
        ) : (
          <>
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
                  {selfIsPlayer1 ? result.data.player2.score : result.data.player1.score}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selfIsPlayer1 ? result.data.player2.correct : result.data.player1.correct}✓{' '}
                  {selfIsPlayer1 ? result.data.player2.wrong : result.data.player1.wrong}✗
                </p>
              </div>
            </div>
            {result.data.ratingStatus === 'COMPLETED' ? (
              <div className="flex w-full max-w-md items-center justify-center gap-6 rounded-xl border border-border bg-elevated p-4">
                <div className="text-center">
                  <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                    Your rating
                  </p>
                  <p
                    className={cn(
                      'font-metric text-stat',
                      (result.data.ratingChange.self ?? 0) > 0
                        ? 'text-success'
                        : (result.data.ratingChange.self ?? 0) < 0
                          ? 'text-destructive'
                          : 'text-foreground',
                    )}
                  >
                    {result.data.ratingChange.self === null
                      ? '—'
                      : result.data.ratingChange.self > 0
                        ? `+${result.data.ratingChange.self}`
                        : result.data.ratingChange.self}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-metadata uppercase tracking-wide text-subtle-foreground">
                    Opponent
                  </p>
                  <p className="font-metric text-stat text-muted-foreground">
                    {result.data.ratingChange.opponent === null
                      ? '—'
                      : result.data.ratingChange.opponent > 0
                        ? `+${result.data.ratingChange.opponent}`
                        : result.data.ratingChange.opponent}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {result.data.ratingStatus === 'FAILED'
                  ? 'Rating could not be processed yet — it will be retried shortly.'
                  : 'Rating is being processed…'}
              </p>
            )}
          </>
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
  const { phase, state, connected, error } = challenge;

  if (phase === 'searching') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
          <div>
            <p className="text-section-title text-foreground">Finding an opponent…</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Matching you with a player near your rating. This usually takes a few seconds.
            </p>
          </div>
          <Button variant="outline" onClick={challenge.cancelMatchmaking}>
            Cancel search
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (phase === 'countdown' && state) {
    return <CountdownPanel state={state} />;
  }

  if (phase === 'live' && state) {
    return <LiveChallenge state={state} onSubmit={challenge.submitAnswer} />;
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

function CountdownPanel({ state }: { state: ChallengeStateDto }): React.JSX.Element {
  const seconds = useCountdown(state.countdownEndsAt, state.serverTime);
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <Badge variant="success">
          <Check className="size-3" aria-hidden />
          Opponent found
        </Badge>
        <p className="text-section-title text-foreground">
          {state.opponent?.displayName ?? 'Opponent'}
          <span className="font-metric ml-2 text-muted-foreground">
            {state.opponent?.rating ?? 1000}
          </span>
        </p>
        <p className="font-metric text-5xl font-extrabold text-primary">{seconds}</p>
        <p className="text-sm text-muted-foreground">
          {state.questionCount} questions · {Math.round(state.config.durationSeconds / 60)} minutes
          · +1 correct / −1 wrong
        </p>
      </CardContent>
    </Card>
  );
}
