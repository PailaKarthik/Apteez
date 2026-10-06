'use client';

import { Bell } from 'lucide-react';
import * as React from 'react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  InboxEmpty,
  cn,
} from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useMarkAllRead, useNotifications, useUnreadCount } from '@/hooks/use-events';

/**
 * Notifications entry point. Signed-in users see their unread badge plus
 * the latest inbox rows from `GET /notifications`; signed-out users see the
 * intentional empty state. Mark-all-read invalidates the cached queries.
 *
 * Latency design: the inbox list only fetches when the dropdown actually
 * opens — it never joins the initial page-load waterfall (auth + page data
 * already saturate the pooler). The lightweight unread badge stays eager.
 */
export function NotificationsMenu(): React.JSX.Element {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const [open, setOpen] = React.useState(false);
  const { data: unread } = useUnreadCount({ enabled: signedIn });
  const { data: inbox } = useNotifications(false, { enabled: signedIn && open });
  const markAllRead = useMarkAllRead();

  const unreadCount = unread?.unread ?? 0;
  const items = inbox?.items.slice(0, 5) ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell aria-hidden />
          {unreadCount > 0 ? (
            <span
              className={cn(
                'absolute right-1 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground',
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {signedIn && unreadCount > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => markAllRead.mutate()}
            >
              Mark all read
            </button>
          ) : null}
        </DropdownMenuLabel>
        {!signedIn || items.length === 0 ? (
          <div className="px-2 pb-2 pt-1">
            <InboxEmpty compact />
          </div>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} className="flex flex-col items-start gap-0.5">
              <span className="w-full truncate text-sm font-medium">{item.title}</span>
              {item.body ? (
                <span className="w-full truncate text-xs text-muted-foreground">{item.body}</span>
              ) : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
