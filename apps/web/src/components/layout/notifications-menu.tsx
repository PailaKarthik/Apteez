'use client';

import { Bell } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  InboxEmpty,
} from '@apteez/ui';

/**
 * Notifications/messages entry point. The real feed lands with the
 * notification feature; this shows the intentional empty state and keeps
 * the trigger structurally ready for a live badge.
 */
export function NotificationsMenu(): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications">
          <Bell aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <div className="px-2 pb-2 pt-1">
          <InboxEmpty compact />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
