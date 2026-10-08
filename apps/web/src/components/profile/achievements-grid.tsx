'use client';

import { Trophy } from 'lucide-react';
import type { AchievementDto } from '@apteez/types';
import { Badge, Card, CardContent, CardTitle, cn } from '@apteez/ui';

export function AchievementsGrid({
  items,
  isLoading,
}: {
  items: AchievementDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <Card className="animate-fade-in">
        <CardContent className="space-y-3 p-6" aria-busy="true" aria-label="Loading achievements">
          <div className="skeleton-shine h-5 w-44 rounded-md" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border p-4" aria-hidden>
                <div className="skeleton-shine size-8 rounded-lg" />
                <div className="skeleton-shine h-4 w-2/3 rounded-md" />
                <div className="skeleton-shine h-3 w-1/3 rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }
  const unlocked = (items ?? []).filter((row) => row.isUnlocked);
  return (
    <Card>
      <CardContent className="space-y-3 p-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-card-title">Achievements</CardTitle>
          <span className="text-sm text-muted-foreground">
            <span className="font-metric">{unlocked.length}</span>/
            <span className="font-metric">{items?.length ?? 0}</span> unlocked
          </span>
        </div>
        {!items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Achievements load with your profile.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((row, index) => (
              <li
                key={row.id}
                className={cn(
                  'row-enter rounded-xl border p-4 transition-all duration-300 hover:-translate-y-1',
                  row.isUnlocked
                    ? 'border-gold/50 bg-gold/5 shadow-[0_0_24px_-10px_hsl(var(--gold)/0.5)] hover:shadow-[0_12px_32px_-10px_hsl(var(--gold)/0.5)]'
                    : 'border-border opacity-70 hover:opacity-100',
                )}
                style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex size-8 items-center justify-center rounded-lg',
                      row.isUnlocked ? 'bg-gold/15' : 'bg-muted',
                    )}
                    aria-hidden
                  >
                    <Trophy
                      className={cn('size-4', row.isUnlocked ? 'text-gold' : 'text-muted-foreground')}
                    />
                  </span>
                  <span className="text-sm font-semibold">{row.name}</span>
                </div>
                {row.description ? (
                  <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
                ) : null}
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={row.isUnlocked ? 'success' : 'outline'}>
                    {row.isUnlocked ? 'Unlocked' : 'Locked'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    +<span className="font-metric">{row.points}</span> pts
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
