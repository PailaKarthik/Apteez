'use client';

import { Crown, Medal, Trophy } from 'lucide-react';
import * as React from 'react';
import type {
  ContestRatingLeaderboardEntryDto,
  RatingLeaderboardEntryDto,
  RatingTier,
} from '@apteez/types';
import { RATING_TIER_LABELS } from '@apteez/types';
import {
  Avatar,
  AvatarFallback,
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@apteez/ui';
import { useChallengeDomains } from '@/hooks/use-challenge';
import { useContestRatingLeaderboard, useRatingLeaderboard } from '@/hooks/use-ratings';
import { ProfileName } from '@/components/profile/profile-link';

const TIER_TONE: Record<RatingTier, 'secondary' | 'outline' | 'success' | 'warning' | 'default'> = {
  BEGINNER: 'secondary',
  INTERMEDIATE: 'outline',
  ADVANCED: 'outline',
  EXPERT: 'warning',
  ELITE: 'success',
};

type RatingSection = 'contest' | 'challenge';

function RankBadge({ rank }: { rank: number }): React.JSX.Element {
  if (rank <= 3) {
    return (
      <span
        className={cn(
          'flex size-8 items-center justify-center rounded-full',
          rank === 1
            ? 'bg-gold/20 text-gold'
            : rank === 2
              ? 'bg-muted-foreground/20 text-muted-foreground'
              : 'bg-warning/20 text-warning',
        )}
      >
        {rank === 1 ? (
          <Crown className="size-4" aria-hidden />
        ) : (
          <Medal className="size-4" aria-hidden />
        )}
      </span>
    );
  }
  return (
    <span className="font-metric flex size-8 items-center justify-center text-sm font-semibold text-muted-foreground">
      {rank}
    </span>
  );
}

function ChallengeRow({ entry, index = 0 }: { entry: RatingLeaderboardEntryDto; index?: number }): React.JSX.Element {
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || 'A';
  return (
    <div
      className="row-enter row-glow group flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 sm:gap-3"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <RankBadge rank={entry.rank} />
      <Avatar className="size-9 border border-border transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md group-hover:shadow-primary/20">
        <AvatarFallback className="text-xs font-semibold">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
          <ProfileName username={entry.username} displayName={entry.displayName} />
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.username ? `@${entry.username}` : 'Member'}
          {entry.institution ? ` · ${entry.institution}` : ''}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-xs text-muted-foreground">
          {entry.matches} match{entry.matches === 1 ? '' : 'es'} · {entry.winRate}% win rate
        </p>
      </div>
      {/* Tier badge hides on phones: rank + avatar + rating already take
          ~200px, leaving the name unreadable. */}
      <Badge variant={TIER_TONE[entry.tier]} className="hidden shrink-0 sm:inline-flex">
        {RATING_TIER_LABELS[entry.tier]}
      </Badge>
      <span className="font-metric w-12 shrink-0 text-right text-base font-bold text-foreground sm:w-14 sm:text-lg">
        {entry.rating}
      </span>
    </div>
  );
}

function ContestRow({ entry, index = 0 }: { entry: ContestRatingLeaderboardEntryDto; index?: number }): React.JSX.Element {
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || 'A';
  return (
    <div
      className={cn(
        'row-enter row-glow group flex items-center gap-2 rounded-lg border px-3 py-2.5 sm:gap-3',
        entry.rank === 1 ? 'border-gold/40 bg-gold/[0.04]' : 'border-border',
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <RankBadge rank={entry.rank} />
      <Avatar className="size-9 border border-border transition-all duration-300 group-hover:border-primary/50 group-hover:shadow-md group-hover:shadow-primary/20">
        <AvatarFallback className="text-xs font-semibold">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
          <ProfileName username={entry.username} displayName={entry.displayName} />
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.username ? `@${entry.username}` : 'Member'}
          {entry.institution ? ` · ${entry.institution}` : ''}
        </p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="text-xs text-muted-foreground">
          {entry.contestsPlayed} contest{entry.contestsPlayed === 1 ? '' : 's'}
          {entry.bestRank ? ` · best #${entry.bestRank}` : ''}
        </p>
      </div>
      <Badge variant={TIER_TONE[entry.tier]} className="hidden shrink-0 sm:inline-flex">
        {RATING_TIER_LABELS[entry.tier]}
      </Badge>
      <span className={cn('font-metric w-12 shrink-0 text-right text-base font-bold sm:w-14 sm:text-lg', entry.rank === 1 ? 'gradient-text-gold' : 'text-foreground')}>
        {entry.rating}
      </span>
    </div>
  );
}

function RowsSkeleton({ rows = 6 }: { rows?: number }): React.JSX.Element {
  return (
    <Card className="animate-fade-in overflow-hidden">
      <div className="loading-rail h-1" aria-hidden>
        <span />
      </div>
      <CardContent className="grid gap-2 p-3" aria-busy="true" aria-label="Loading rankings">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="animate-fade-up flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
            style={{ animationDelay: `${Math.min(i, 5) * 60}ms` }}
            aria-hidden
          >
            <div className="skeleton-shine size-8 rounded-full" />
            <div className="skeleton-shine size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton-shine h-4 w-32 rounded-md" />
              <div className="skeleton-shine h-3 w-24 rounded-md" />
            </div>
            <div className="skeleton-shine h-5 w-16 rounded-full" />
            <div className="skeleton-shine h-6 w-14 rounded-md" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Podium({
  entries,
}: {
  entries: { userId: string; rank: number; displayName: string; username: string | null; rating: number }[];
}): React.JSX.Element {
  const ordered = [...entries].sort((a, b) => a.rank - b.rank);
  const spotlight: (typeof ordered[number] | null)[] = [ordered[1] ?? null, ordered[0] ?? null, ordered[2] ?? null];
  const frames = [
    'border-muted-foreground/30',
    'border-gold/50 shadow-[0_0_36px_-10px_hsl(var(--gold)/0.5)]',
    'border-warning/40',
  ];
  const medals = ['text-muted-foreground', 'text-gold', 'text-warning'];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border" aria-label="Top three">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.1] via-card to-card" aria-hidden />
      <div className="aurora-field" aria-hidden>
        <span className="aurora-orb left-[20%] top-[-70%] size-56 bg-primary/20" />
        <span className="aurora-orb right-[15%] top-[-40%] size-48 bg-gold/15 [animation-delay:-6s]" />
      </div>
      <div className="relative grid grid-cols-3 items-end gap-2 p-4 sm:gap-3 sm:p-5">
        {spotlight.map((entry, slot) => {
          const isFirst = slot === 1;
          if (!entry) {
            return <span key={slot} />;
          }
          const initial = entry.displayName.trim().charAt(0).toUpperCase() || 'A';
          return (
            <div
              key={entry.userId}
              className="animate-fade-up flex flex-col items-center gap-1.5 text-center"
              style={{ animationDelay: `${slot * 90}ms` }}
            >
              {isFirst ? <Crown className="size-5 animate-float text-gold" aria-hidden /> : null}
              <Avatar className={cn('border-2', frames[slot], isFirst ? 'size-14' : 'size-11')}>
                <AvatarFallback className={cn('font-bold', medals[slot], isFirst ? 'text-lg' : 'text-sm')}>
                  {initial}
                </AvatarFallback>
              </Avatar>
              <p className="w-full truncate text-xs font-semibold text-foreground sm:text-sm">
                {entry.displayName}
              </p>
              <p className={cn('font-metric font-extrabold', isFirst ? 'gradient-text-gold text-xl' : 'text-sm text-muted-foreground')}>
                {entry.rating}
              </p>
              <span className={cn('font-metric rounded-full px-2 py-0.5 text-[11px] font-bold', isFirst ? 'bg-gold/15 text-gold' : 'bg-muted text-muted-foreground')}>
                #{entry.rank}
              </span>
            </div>
          );
        })}
      </div>
      <div className="relative h-1 bg-gradient-to-r from-primary via-gold to-primary" aria-hidden />
    </div>
  );
}

/**
 * Global leaderboard with exactly 2 rating sections:
 * - Contest: overall performance across contests (single global board).
 * - Challenge: per-domain ratings with the 7 aptitude sections as a dropdown.
 */
export function LeaderboardBoard(): React.JSX.Element {
  const [section, setSection] = React.useState<RatingSection>('contest');
  const [domain, setDomain] = React.useState<string | null>(null);
  const [institution, setInstitution] = React.useState('');

  const domains = useChallengeDomains();
  const trimmedInstitution = institution.trim() || undefined;

  const activeDomain = domain ?? domains.data?.[0]?.slug ?? '';
  const challengeBoard = useRatingLeaderboard(
    section === 'challenge' ? activeDomain : '',
    trimmedInstitution,
  );
  const contestBoard = useContestRatingLeaderboard(
    section === 'contest' ? trimmedInstitution : undefined,
  );

  // Keep the dropdown defaulting to the first domain once loaded.
  React.useEffect(() => {
    if (section === 'challenge' && !domain && domains.data?.[0]?.slug) {
      setDomain(domains.data[0].slug);
    }
  }, [section, domain, domains.data]);

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-elevated p-1"
        role="tablist"
        aria-label="Rating sections"
      >
        {(
          [
            { value: 'contest', label: 'Contest' },
            { value: 'challenge', label: 'Challenge' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={section === tab.value}
            onClick={() => setSection(tab.value)}
            className={cn(
              'rounded-xl px-4 py-2 text-sm font-semibold transition-all',
              section === tab.value
                ? 'bg-primary text-primary-foreground shadow-[0_0_20px_-6px_hsl(var(--primary)/0.5)]'
                : 'text-muted-foreground hover:bg-hover hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-elevated p-4 sm:grid-cols-2">
        {section === 'challenge' ? (
          <Select value={activeDomain} onValueChange={setDomain}>
            <SelectTrigger aria-label="Challenge section (7 aptitude domains)">
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {(domains.data ?? []).map((item) => (
                <SelectItem key={item.slug} value={item.slug}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="flex items-center rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            Overall contest performance — one global board
          </div>
        )}
        <Input
          value={institution}
          placeholder="Filter by university (optional)"
          aria-label="University filter"
          onChange={(event) => setInstitution(event.target.value)}
        />
      </div>

      {section === 'contest' ? (
        contestBoard.isPending ? (
          <RowsSkeleton />
        ) : contestBoard.isError ? (
          <ErrorState
            title="Could not load contest rankings"
            onRetry={() => void contestBoard.refetch()}
          />
        ) : (contestBoard.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No contest ratings yet"
            description={
              trimmedInstitution
                ? 'No one from that university has played a contest yet.'
                : 'Play a contest to establish your contest rating.'
            }
          />
        ) : (
          <div className="space-y-3">
            {(contestBoard.data ?? []).length >= 3 && !trimmedInstitution ? (
              <Podium entries={(contestBoard.data ?? []).slice(0, 3)} />
            ) : null}
            <Card className="animate-fade-in">
              <CardContent className="grid gap-2 p-3">
                {(contestBoard.data ?? []).map((entry, index) => (
                  <ContestRow key={entry.userId} entry={entry} index={index} />
                ))}
              </CardContent>
            </Card>
          </div>
        )
      ) : domains.isPending ? (
        <RowsSkeleton rows={3} />
      ) : domains.isError ? (
        <ErrorState title="Could not load domains" onRetry={() => void domains.refetch()} />
      ) : challengeBoard.isPending ? (
        <RowsSkeleton />
      ) : challengeBoard.isError ? (
        <ErrorState title="Could not load rankings" onRetry={() => void challengeBoard.refetch()} />
      ) : (challengeBoard.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No ranked players yet"
          description={
            trimmedInstitution
              ? 'No one from that university has played this section yet.'
              : 'Be the first to establish a rating in this section.'
          }
        />
      ) : (
        <Card className="animate-fade-in">
          <CardContent className="grid gap-2 p-3">
            {(challengeBoard.data ?? []).map((entry, index) => (
              <ChallengeRow key={entry.userId} entry={entry} index={index} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
