import { ArrowRight, Hammer, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent, cn } from '@apteez/ui';

export interface SectionPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
}

/**
 * Animated placeholder boundary for sections whose full functionality
 * lands later. Aurora wash + floating icon + staggered points — never a
 * dead end: every placeholder links onward.
 */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  points,
}: SectionPlaceholderProps): React.JSX.Element {
  return (
    <Card className="overflow-hidden">
      <CardContent className="relative overflow-hidden p-0">
        <div className="aurora-field" aria-hidden>
          <span className="aurora-orb -left-12 -top-20 size-64 bg-primary/20" />
          <span className="aurora-orb -right-12 bottom-[-60%] size-72 bg-primary/15 [animation-delay:-6s]" />
          <span className="dot-grid absolute inset-0 opacity-50" />
        </div>
        <div className="relative flex flex-col items-start gap-5 p-6 sm:p-8">
          <span className="page-enter flex items-center gap-3">
            <span className="icon-tile size-12">
              <Icon className="size-6" aria-hidden />
            </span>
            <Badge variant="secondary" className="gap-1.5">
              <Hammer className="size-3 animate-pulse-soft" aria-hidden />
              In development
            </Badge>
          </span>
          <div className="page-enter-1 space-y-2">
            <h2 className="text-section-title text-foreground">{title}</h2>
            <span
              className="block h-1 w-14 rounded-full bg-gradient-to-r from-primary to-accent-foreground"
              aria-hidden
            />
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <ul className="grid w-full gap-2 sm:grid-cols-2">
            {points.map((point, index) => (
              <li
                key={point}
                className={cn(
                  'card-lift flex items-start gap-2 rounded-xl border border-border bg-card/70 px-3 py-2.5 text-sm text-muted-foreground backdrop-blur',
                  'animate-fade-up',
                )}
                style={{ animationDelay: `${150 + index * 80}ms` }}
              >
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
          <div className="page-enter-2 flex flex-wrap gap-2">
            <Button asChild className="btn-sheen">
              <Link href="/">Back to home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/explore">Explore questions</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
