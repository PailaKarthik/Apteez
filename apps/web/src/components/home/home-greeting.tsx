'use client';

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

/** Personal greeting: time-of-day + name, current date and live streak. */
export function HomeGreeting(): React.JSX.Element {
  const { user } = useAuth();
  const { data: streak } = useStreak({ enabled: Boolean(user) });

  const now = new Date();
  const name = user?.displayName?.trim() ? `, ${user.displayName.trim()}` : '';
  const dateLine = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const streakDays = streak?.current ?? 0;
  const streakLine = user
    ? streakDays > 0
      ? `${dateLine} · ${streakDays}-day streak active`
      : `${dateLine} · solve today to start a streak`
    : `${dateLine} · sign in to track streaks`;

  return (
    <section aria-label="Welcome" className="min-w-0 space-y-1">
      <h1 className="break-words text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {greetingFor(now)}
        {name}
      </h1>
      <p className="text-sm text-muted-foreground">{streakLine}</p>
    </section>
  );
}
