import { ArrowRight, Compass } from 'lucide-react';
import Link from 'next/link';
import { Button, EmptyState } from '@apteez/ui';

export default function NotFound(): React.JSX.Element {
  return (
    <div className="py-10">
      <div className="animate-scale-in mx-auto max-w-lg space-y-5 text-center">
        <div className="aurora-field relative mx-auto flex h-40 items-center justify-center overflow-hidden rounded-3xl border border-border" aria-hidden>
          <span className="aurora-orb left-[20%] top-[-60%] size-48 bg-primary/25" />
          <span className="aurora-orb right-[15%] top-[-30%] size-48 bg-primary/15 [animation-delay:-6s]" />
          <span className="dot-grid absolute inset-0 opacity-60" />
          <span className="glass relative flex size-16 items-center justify-center rounded-2xl border border-border shadow-xl">
            <Compass className="size-8 animate-float text-primary" />
          </span>
        </div>
        <EmptyState
          title="Page not found"
          description="The route you followed does not exist. Head back home or explore the question library."
          action={
            <div className="flex justify-center gap-2">
              <Button asChild className="btn-sheen shadow-lg shadow-primary/20">
                <Link href="/">
                  Back to home
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/explore">Explore</Link>
              </Button>
            </div>
          }
        />
      </div>
    </div>
  );
}
