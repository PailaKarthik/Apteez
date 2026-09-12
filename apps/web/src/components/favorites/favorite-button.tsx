'use client';

import { Heart, Loader2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Button, cn } from '@apteez/ui';
import { useFavoriteToggle } from '@/hooks/use-favorites';

export interface FavoriteButtonProps {
  problemId: string;
  /** Current favorite state (from the server). */
  favorited: boolean;
  /** Icon-only vs labelled variants. */
  variant?: 'icon' | 'full';
  className?: string;
}

/**
 * Heart toggle for the default Favorites collection. State comes from the
 * server (never localStorage); the mutation is idempotent server-side, so
 * rapid clicks cannot corrupt data even before the button disables.
 */
export function FavoriteButton({
  problemId,
  favorited,
  variant = 'icon',
  className,
}: FavoriteButtonProps): React.JSX.Element {
  const toggle = useFavoriteToggle();

  const onClick = (event: React.MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    toggle.mutate(
      { problemId, next: !favorited },
      {
        onSuccess: (result) =>
          toast.success(result.favorited ? 'Saved to Favorites' : 'Removed from Favorites'),
        onError: () => toast.error('Could not update favorites. Try again.'),
      },
    );
  };

  if (variant === 'full') {
    return (
      <Button
        variant={favorited ? 'default' : 'outline'}
        onClick={onClick}
        disabled={toggle.isPending}
        aria-pressed={favorited}
        aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
        className={className}
      >
        {toggle.isPending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Heart className={cn(favorited && 'fill-current')} aria-hidden />
        )}
        {favorited ? 'Saved' : 'Save'}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={favorited}
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      className={className}
    >
      {toggle.isPending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : (
        <Heart className={cn('size-4', favorited && 'fill-gold text-gold')} aria-hidden />
      )}
    </Button>
  );
}
