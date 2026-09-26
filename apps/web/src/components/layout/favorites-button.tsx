'use client';

import { Bookmark, Heart } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  FavoritesEmpty,
} from '@apteez/ui';
import { useAuth } from '@/hooks/use-auth';
import { useFavoriteCollections, useFavoriteProblems } from '@/hooks/use-favorites';

/**
 * Favorites entry point. Signed-in users see their collections with live
 * counts plus the most recently saved problems from `GET
 * /favorite-collections` and `GET /favorites`; signed-out users see the
 * intentional empty state.
 */
export function FavoritesButton(): React.JSX.Element {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const { data: collections } = useFavoriteCollections({ enabled: signedIn });
  const { data: favorites } = useFavoriteProblems({ limit: 5 }, { enabled: signedIn });

  const totalSaved = (collections ?? []).reduce((sum, c) => sum + c.problemCount, 0);
  const recent = favorites?.items.slice(0, 5) ?? [];

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
          {signedIn ? (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {totalSaved} saved
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!signedIn || (collections?.length === 0 && recent.length === 0) ? (
          <div className="px-2 pb-2 pt-1">
            <FavoritesEmpty compact />
          </div>
        ) : (
          <>
            {(collections ?? []).slice(0, 4).map((collection) => (
              <DropdownMenuItem key={collection.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm font-medium">{collection.name}</span>
                <span className="text-xs text-muted-foreground">{collection.problemCount}</span>
              </DropdownMenuItem>
            ))}
            {recent.map((problem) => (
              <DropdownMenuItem key={problem.id} className="flex flex-col items-start gap-0.5">
                <span className="w-full truncate text-sm">{problem.title}</span>
                <span className="text-xs text-muted-foreground">
                  {problem.topic ? `${problem.topic.name} · ` : ''}
                  {problem.difficulty}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
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
