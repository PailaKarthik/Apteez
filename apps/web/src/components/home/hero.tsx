import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button } from '@apteez/ui';
import { BRAND } from '@apteez/config';

/** Landing hero: product promise plus the two primary calls to action. */
export function Hero(): React.JSX.Element {
  return (
    <section className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card px-6 py-10 sm:px-10 sm:py-14">
      <div className="max-w-2xl space-y-4">
        <Badge variant="secondary">
          <Sparkles className="size-3" aria-hidden />
          Competitive aptitude ecosystem
        </Badge>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl">
          Sharpen your aptitude.
          <span className="block text-primary">Compete with the best.</span>
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          {BRAND.tagline} Daily challenges, live contests and a community-driven question library —
          built for serious aspirants.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="lg" asChild>
            <Link href="/challenge">
              Start a challenge
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/explore">Explore questions</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
