import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardTitle } from '@apteez/ui';
import { PRIMARY_NAV } from '@apteez/config';
import { NAV_ICONS } from '@/components/layout/nav-icons';

const ARENA_COPY: Record<string, { description: string }> = {
  challenge: { description: 'Head-to-head aptitude duels against a live opponent.' },
  contests: { description: 'Scheduled competitions with leaderboards and ratings.' },
  explore: { description: 'Browse the question library by topic and difficulty.' },
  leaderboard: { description: 'Global and sectional rankings, updated every contest.' },
  discussions: { description: 'Strategies, solutions and doubt-solving with peers.' },
  events: { description: 'Workshops, marathons and community meetups.' },
};

/** Cards for the six competitive areas (Home excluded — you are here). */
export function ArenaGrid(): React.JSX.Element {
  const arenas = PRIMARY_NAV.filter((item) => item.key !== 'home');

  return (
    <section aria-label="Competitive arenas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {arenas.map((arena) => {
        const Icon = NAV_ICONS[arena.icon];
        return (
          <Link key={arena.key} href={arena.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary/50 group-hover:shadow-md">
              <CardContent className="flex h-full flex-col gap-3 p-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="flex items-center gap-1.5">
                  <CardTitle className="text-base">{arena.label}</CardTitle>
                  <ArrowUpRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary"
                    aria-hidden
                  />
                </div>
                <CardDescription>{ARENA_COPY[arena.key]?.description ?? ''}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </section>
  );
}
