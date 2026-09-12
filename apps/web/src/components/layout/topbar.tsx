import { Breadcrumb } from './breadcrumb';
import { FavoritesButton } from './favorites-button';
import { HelpMenu } from './help-menu';
import { MobileNav } from './mobile-nav';
import { NotificationsMenu } from './notifications-menu';
import { StreakPill } from './streak-pill';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/**
 * Persistent top bar per the Figma structure: section context on the left;
 * streak, favorites, notifications, help, theme and profile on the right.
 * Streak/favorites compact down on mobile; nothing overflows.
 */
export function Topbar(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-30 flex h-top-bar shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:gap-3 sm:px-6">
      <MobileNav />
      <Breadcrumb />
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <StreakPill />
        <FavoritesButton />
        <NotificationsMenu />
        <HelpMenu />
        <ThemeToggle />
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
}
