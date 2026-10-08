'use client';

import Link from 'next/link';
import { ArrowRight, Flame, Sparkles, Swords } from 'lucide-react';
import { Button } from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useStreak } from '@/hooks/use-profile';

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/**
 * Cinematic home hero: aurora mesh, gradient greeting, live streak chip
 * and quick-action CTAs. Entrance is CSS-staggered; orbs drift forever.
 */
export function HomeGreeting(): React.JSX.Element {
  const { user } = useAuth();
  const { data: streak } = useStreak({ enabled: Boolean(user) });

  const now = new Date();
  const name = user?.displayName?.trim() ? `, ${user.displayName.trim().split(' ')[0]}` : '';
  const dateLine = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);
  const streakDays = streak?.current ?? 0;

  return (
    <section
      aria-label="Welcome"
      className="page-enter relative overflow-hidden rounded-3xl border border-border"
    >
      {/* Aurora backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.14] via-card to-card" aria-hidden />
      <div className="aurora-field" aria-hidden>
        <span className="aurora-orb -left-16 -top-24 size-72 bg-primary/30" />
        <span className="aurora-orb right-[-4rem] top-[-3rem] size-64 bg-primary/20 [animation-delay:-5s]" />
        <span className="aurora-orb bottom-[-6rem] left-[38%] size-72 bg-accent-foreground/15 [animation-delay:-9s]" />
        <span className="dot-grid absolute inset-0 opacity-60" />
      </div>
      <div className="relative flex flex-col gap-6 p-6 sm:p-9 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-2xl space-y-3">
          <p className="page-enter inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            {dateLine}
            <span className="h-3 w-px bg-primary/30" aria-hidden />
            <span className="inline-flex items-center gap-1">
              <Flame
                className={streakDays > 0 ? 'size-3.5 text-warning' : 'size-3.5 opacity-60'}
                aria-hidden
              />
              {streakDays > 0 ? `${streakDays}-day streak` : 'Start your streak today'}
            </span>
          </p>
          <h1 className="page-enter-1 break-words text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
            {greetingFor(now)}
            {name ? (
              <>
                , <span className="gradient-text">{name.slice(2)}</span>
              </>
            ) : (
              <>
                , <span className="gradient-text">achiever</span>
              </>
            )}
          </h1>
          <p className="page-enter-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {user
              ? streakDays > 0
                ? 'Your arena is warmed up — pick a folder below or jump into a live contest to keep the fire alive.'
                : 'Solve one problem today to ignite your streak. Every rating point starts here.'
              : 'Practice aptitude, climb contests and earn rewards. Sign in to track streaks, rating and points.'}
          </p>
          <div className="page-enter-3 flex flex-wrap gap-2 pt-1">
            <Button asChild className="btn-sheen shadow-lg shadow-primary/25">
              <Link href="/challenge">
                <Swords aria-hidden />
                Start practicing
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button variant="outline" asChild className="glass">
              <Link href="/contests">View live contests</Link>
            </Button>
            {!user ? (
              <Button variant="ghost" asChild>
                <Link href="/register">Create free account</Link>
              </Button>
            ) : null}
          </div>
        </div>

        {/* Streak constellation card */}
        <div className="page-enter-2 glass w-full max-w-xs shrink-0 rounded-2xl border border-border p-5 shadow-xl lg:w-64">
          <div className="flex items-center justify-between">
            <p className="text-metadata uppercase tracking-[0.16em] text-muted-foreground">
              Today&apos;s momentum
            </p>
            <span className="relative flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-warning text-white shadow-lg shadow-warning/30">
              <Flame className="size-5" aria-hidden />
              {streakDays > 0 ? (
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-foreground font-metric text-[10px] font-bold text-background">
                  {streakDays}
                </span>
              ) : null}
            </span>
          </div>
          <div className="mt-3 flex items-end gap-1.5" aria-hidden>
            {[38, 62, 45, 80, 56, 92, streakDays > 0 ? 100 : 22].map((height, i) => (
              <span
                key={i}
                className={
                  i === 6
                    ? 'w-full rounded-md bg-gradient-to-t from-primary to-accent-foreground shadow-[0_0_16px_-2px_hsl(var(--primary)/0.6)]'
                    : 'w-full rounded-md bg-muted'
                }
                style={{ height: `${height * 0.7}px`, opacity: i === 6 ? 1 : 0.35 + i * 0.09 }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {streakDays > 0
              ? `${streakDays} day${streakDays === 1 ? '' : 's'} burning — solve today to extend it.`
              : 'Seven days of potential. Solve today to light the first bar.'}
          </p>
        </div>
      </div>

      <div
        className="relative h-1 bg-gradient-to-r from-primary via-accent-foreground to-primary"
        aria-hidden
      />
    </section>
  );
}
