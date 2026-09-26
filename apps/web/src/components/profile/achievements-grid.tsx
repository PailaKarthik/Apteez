'use client';

import { Trophy } from 'lucide-react';
import type { AchievementDto } from '@apteez/types';
import { Badge, Card, CardContent, CardTitle, Skeleton, cn } from '@apteez/ui';

export function AchievementsGrid({
  items,
  isLoading,
}: {
  items: AchievementDto[] | undefined;
  isLoading: boolean;
}): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-44" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
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
            {items.map((row) => (
              <li
                key={row.id}
                className={cn(
                  'rounded-xl border p-4',
                  row.isUnlocked ? 'border-gold/50 bg-gold/5' : 'border-border opacity-70',
                )}
              >
                <div className="flex items-center gap-2">
                  <Trophy
                    className={cn('size-4', row.isUnlocked ? 'text-gold' : 'text-muted-foreground')}
                    aria-hidden
                  />
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
