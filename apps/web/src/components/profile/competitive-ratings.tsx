'use client';

import { Swords } from 'lucide-react';
import Link from 'next/link';
import type { RatingDomainDto, RatingTier } from '@apteez/types';
import { RATING_TIER_LABELS } from '@apteez/types';
import { Badge, Card, CardContent, CardTitle, EmptyState, Skeleton, cn } from '@apteez/ui';
import { useMyRatings } from '@/hooks/use-ratings';

const TIER_TONE: Record<RatingTier, 'secondary' | 'outline' | 'success' | 'warning' | 'default'> = {
  BEGINNER: 'secondary',
  INTERMEDIATE: 'outline',
  ADVANCED: 'outline',
  EXPERT: 'warning',
  ELITE: 'success',
};

function ChangeChip({ value }: { value: number | null }): React.JSX.Element | null {
  if (value === null || value === 0) {
    return null;
  }
  return (
    <span
      className={cn(
        'font-metric text-xs font-semibold',
        value > 0 ? 'text-success' : 'text-destructive',
      )}
    >
      {value > 0 ? `+${value}` : value}
    </span>
  );
}

function DomainRow({ rating }: { rating: RatingDomainDto }): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{rating.domainName}</p>
        <p className="text-xs text-muted-foreground">
          {rating.matches} match{rating.matches === 1 ? '' : 'es'} · {rating.winRate}% win rate
        </p>
      </div>
      <Badge variant={TIER_TONE[rating.tier]}>{RATING_TIER_LABELS[rating.tier]}</Badge>
      <div className="flex items-baseline gap-1.5 text-right">
        <span className="font-metric text-lg font-bold text-foreground">{rating.rating}</span>
        <ChangeChip value={rating.latestChange} />
      </div>
    </div>
  );
}

/** Competitive summary + per-domain challenge ratings for the signed-in user. */
export function CompetitiveRatings(): React.JSX.Element {
  const { data, isPending, isError } = useMyRatings();

  if (isPending) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5" aria-busy="true">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="p-5 text-sm text-muted-foreground">
          Could not load your competitive ratings.
        </CardContent>
      </Card>
    );
  }

  const ratings = data?.ratings ?? [];
  if (ratings.length === 0) {
    return (
      <EmptyState
        icon={Swords}
        title="No rated challenges yet"
        description="Play a 1v1 challenge to establish your first domain rating."
        action={
          <Link
            href="/challenge"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Start a challenge
          </Link>
        }
      />
    );
  }

  const totals = data?.totals;
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-card-title">Competitive ratings</CardTitle>
          {totals ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-metric font-semibold text-foreground">
                {totals.wins}W–{totals.losses}L–{totals.draws}D
              </span>{' '}
              across {totals.matches} rated match{totals.matches === 1 ? '' : 'es'}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          {ratings.map((rating) => (
            <DomainRow key={rating.domainSlug} rating={rating} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
