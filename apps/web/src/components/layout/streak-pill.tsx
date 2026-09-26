'use client';

import { Flame } from 'lucide-react';
import * as React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, cn } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useStreak } from '@/hooks/use-profile';

/** Smooth count-up toward `target` (instant under reduced-motion). */
function useAnimatedNumber(target: number): number {
  const [display, setDisplay] = React.useState(target);
  const displayRef = React.useRef(target);
  React.useEffect(() => {
    if (typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const from = displayRef.current;
    if (from === target) {
      return;
    }
    const start = performance.now();
    const duration = 600;
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) * (1 - progress);
      const value = Math.round(from + (target - from) * eased);
      displayRef.current = value;
      setDisplay(value);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return display;
}

/**
 * Streak indicator with a live count-up and a flame pop whenever the streak
 * grows. Signed-in users see `GET /profile/me/streak` (refreshed on every
 * submit via invalidateActivityQueries); guests see a muted pill + hint.
 */
export function StreakPill(): React.JSX.Element {
  const { user } = useAuth();
  const { data } = useStreak({ enabled: Boolean(user) });
  const streak = data?.current ?? 0;
  const activeToday = data?.activeToday ?? false;
  const shown = useAnimatedNumber(streak);
  const [popping, setPopping] = React.useState(false);
  const previous = React.useRef(streak);

  React.useEffect(() => {
    if (streak > previous.current) {
      setPopping(true);
      const timer = setTimeout(() => setPopping(false), 700);
      previous.current = streak;
      return () => clearTimeout(timer);
    }
    previous.current = streak;
    return undefined;
  }, [streak]);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'inline-flex h-8 cursor-default items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition-all sm:px-3',
              activeToday
                ? 'border-gold/50 bg-gold/10 text-foreground shadow-[0_0_16px_-4px_hsl(var(--gold)/0.6)]'
                : 'border-border bg-elevated text-foreground',
            )}
          >
            <Flame
              aria-hidden
              className={cn(
                'size-4 transition-all',
                streak > 0 ? 'fill-gold/20 text-gold' : 'text-muted-foreground',
                popping && 'animate-[streak-pop_0.65s_ease-out]',
              )}
            />
            <span className="font-metric tabular-nums" aria-live="polite">
              {shown}
            </span>
            <span className="hidden font-normal text-muted-foreground md:inline">day streak</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {user
            ? activeToday
              ? `Streak alive at ${streak} day${streak === 1 ? '' : 's'} — come back tomorrow to grow it.`
              : 'Solve a problem today to grow your streak.'
            : 'Sign in to start building your daily streak.'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
