'use client';

import { Flame } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';

/**
 * Streak indicator. Live counts arrive with the activity feature; until
 * then signed-out users see a muted pill and a hint tooltip. Numeric value
 * uses the monospace metric style per the typography rules.
 */
export function StreakPill(): React.JSX.Element {
  const { user } = useAuth();
  const streak = 0;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex h-8 cursor-default items-center gap-1.5 rounded-full border border-border bg-elevated px-2.5 text-sm font-semibold text-foreground transition-colors sm:px-3',
            )}
          >
            <Flame
              className={cn('size-4', streak > 0 ? 'text-gold' : 'text-muted-foreground')}
              aria-hidden
            />
            <span className="font-metric">{streak}</span>
            <span className="hidden font-normal text-muted-foreground md:inline">day streak</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {user
            ? 'Solve every day to grow your streak.'
            : 'Sign in to start building your daily streak.'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
