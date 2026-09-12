'use client';

import { Crown, Medal, Trophy } from 'lucide-react';
import * as React from 'react';
import type { RatingLeaderboardEntryDto, RatingTier } from '@apteez/types';
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
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@apteez/ui';
import { useChallengeDomains } from '@/hooks/use-challenge';
import { useRatingLeaderboard } from '@/hooks/use-ratings';

const TIER_TONE: Record<RatingTier, 'secondary' | 'outline' | 'success' | 'warning' | 'default'> = {
  BEGINNER: 'secondary',
  INTERMEDIATE: 'outline',
  ADVANCED: 'outline',
  EXPERT: 'warning',
  ELITE: 'success',
};

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

function LeaderboardRow({ entry }: { entry: RatingLeaderboardEntryDto }): React.JSX.Element {
  const initial = entry.displayName.trim().charAt(0).toUpperCase() || 'A';
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <RankBadge rank={entry.rank} />
      <Avatar className="size-9 border border-border">
        <AvatarFallback className="text-xs font-semibold">{initial}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.displayName}</p>
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
      <Badge variant={TIER_TONE[entry.tier]}>{RATING_TIER_LABELS[entry.tier]}</Badge>
      <span className="font-metric w-14 text-right text-lg font-bold text-foreground">
        {entry.rating}
      </span>
    </div>
  );
}

/** Global / university challenge leaderboard, filtered by aptitude domain. */
export function LeaderboardBoard(): React.JSX.Element {
  const domains = useChallengeDomains();
  const [domain, setDomain] = React.useState<string | null>(null);
  const [institution, setInstitution] = React.useState('');

  const activeDomain = domain ?? domains.data?.[0]?.slug ?? '';
  const trimmedInstitution = institution.trim();
  const leaderboard = useRatingLeaderboard(activeDomain, trimmedInstitution || undefined);

  if (domains.isPending) {
    return <LoadingState title="Loading leaderboard…" />;
  }
  if (domains.isError) {
    return <ErrorState title="Could not load domains" onRetry={() => void domains.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-border bg-elevated p-4 sm:grid-cols-2">
        <Select value={activeDomain} onValueChange={setDomain}>
          <SelectTrigger aria-label="Domain">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            {(domains.data ?? []).map((item) => (
              <SelectItem key={item.slug} value={item.slug}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={institution}
          placeholder="Filter by university (optional)"
          aria-label="University filter"
          onChange={(event) => setInstitution(event.target.value)}
        />
      </div>

      {leaderboard.isPending ? (
        <LoadingState title="Loading rankings…" />
      ) : leaderboard.isError ? (
        <ErrorState title="Could not load rankings" onRetry={() => void leaderboard.refetch()} />
      ) : (leaderboard.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No ranked players yet"
          description={
            trimmedInstitution
              ? 'No one from that university has played this domain yet.'
              : 'Be the first to establish a rating in this domain.'
          }
        />
      ) : (
        <Card>
          <CardContent className="grid gap-2 p-3">
            {(leaderboard.data ?? []).map((entry) => (
              <LeaderboardRow key={entry.userId} entry={entry} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
