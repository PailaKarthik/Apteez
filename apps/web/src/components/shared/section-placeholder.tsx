import { ArrowRight, Hammer, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge, Button, Card, CardContent } from '@apteez/ui';

export interface SectionPlaceholderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  points: string[];
}

/**
 * Intentional placeholder boundary for sections whose full functionality
 * lands in later prompts. States what the area will become — never a dead
 * end: every placeholder links onward.
 */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  points,
}: SectionPlaceholderProps): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-5 p-6 sm:p-8">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-6" aria-hidden />
        </span>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-section-title text-foreground">{title}</h2>
            <Badge variant="secondary">
              <Hammer className="size-3" aria-hidden />
              In development
            </Badge>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <ul className="grid w-full gap-2 sm:grid-cols-2">
          {points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/explore">Explore questions</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
