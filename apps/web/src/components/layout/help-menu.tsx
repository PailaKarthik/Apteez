'use client';

import { BookOpen, CircleHelp, MessagesSquare, PenLine } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@apteez/ui';

/** Help entry point pointing at real destinations in the current product. */
export function HelpMenu(): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Help">
          <CircleHelp aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Help</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/explore">
            <BookOpen aria-hidden />
            Getting started
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/discussions">
            <MessagesSquare aria-hidden />
            Ask the community
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/contribute">
            <PenLine aria-hidden />
            Contribution guide
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
