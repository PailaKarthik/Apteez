'use client';

import { Bookmark, Heart } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FavoritesEmpty,
} from '@apteez/ui';

/**
 * Favorites entry point. The collections backend arrives with the library
 * feature; the panel already renders the intentional empty state and links
 * to the profile area where collections will live.
 */
export function FavoritesButton(): React.JSX.Element {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Favorites">
          <Heart aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Bookmark className="size-4" aria-hidden />
          Favorites
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="px-2 pb-2 pt-1">
          <FavoritesEmpty compact />
        </div>
        <DropdownMenuSeparator />
        <Link
          href="/favorites"
          className="block rounded-lg px-2.5 py-2 text-center text-sm font-medium text-primary transition-colors hover:bg-accent"
        >
          Open Favorites
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
