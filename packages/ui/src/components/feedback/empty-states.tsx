import { BellOff, Inbox, type LucideIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '../../lib/utils';

export interface FeedbackEmptyProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

/** Shared copy + composition for compact menu/panel empty states. */
function FeedbackEmpty({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: FeedbackEmptyProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-muted/40 px-4 py-8 text-center',
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

/** Notifications panel empty state. */
export function InboxEmpty({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <FeedbackEmpty
      icon={BellOff}
      title="You're all caught up"
      description={
        compact
          ? 'Contest reminders and review updates will appear here.'
          : 'Contest reminders, challenge invites and contribution review updates will appear here as they happen.'
      }
      className={compact ? 'border-0 bg-transparent px-2 py-6' : undefined}
    />
  );
}

/** Favorites empty state. */
export function FavoritesEmpty({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <FeedbackEmpty
      title="No saved questions yet"
      description="Tap the heart on any question to build your personal collection."
      className={compact ? 'border-0 bg-transparent px-2 py-6' : undefined}
    />
  );
}
