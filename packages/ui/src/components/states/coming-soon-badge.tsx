import { Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Badge } from '../ui/badge';

export interface ComingSoonBadgeProps {
  className?: string;
}

/** Standard marker for areas whose full functionality lands later. */
export function ComingSoonBadge({ className }: ComingSoonBadgeProps): React.JSX.Element {
  return (
    <Badge variant="warning" className={cn('uppercase tracking-wide', className)}>
      <Sparkles className="size-3" aria-hidden />
      Coming soon
    </Badge>
  );
}
