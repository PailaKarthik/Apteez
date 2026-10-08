import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';

export interface ComingSoonBadgeProps {
  className?: string;
}

/**
 * Standard marker for areas whose full functionality lands later.
 * Deliberately quiet: theme border + faint violet glow, no fill color —
 * it whispers "soon" instead of shouting it.
 */
export function ComingSoonBadge({ className }: ComingSoonBadgeProps): React.JSX.Element {
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-primary/30 bg-primary/[0.06] uppercase tracking-wide text-muted-foreground shadow-[0_0_14px_-6px_hsl(var(--primary)/0.5)]',
        className,
      )}
    >
      <Sparkles className="size-3 text-primary/70" aria-hidden />
      Coming soon
    </Badge>
  );
}
