import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@apteez/ui';
import { Breadcrumb } from './breadcrumb';
import { GlobalSearch } from '@/components/search/global-search';
import { FavoritesButton } from './favorites-button';
import { HelpMenu } from './help-menu';
import { MobileNav } from './mobile-nav';
import { NotificationsMenu } from './notifications-menu';
import { StreakPill } from './streak-pill';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

/**
 * Persistent top bar per the Figma structure: sidebar toggle + section
 * context on the left; streak, favorites, notifications, help, theme and
 * profile on the right. Streak/favorites compact down on mobile; nothing
 * overflows.
 *
 * Crowding rule: at 360px the icon group alone exceeds the viewport, so the
 * help menu hides below sm and the (wide, 3-segment) theme toggle hides
 * below md — both stay one tap away in the drawer/profile menu. The
 * sidebar toggle only exists on lg+, where the sidebar itself lives.
 */
export function Topbar({
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}): React.JSX.Element {
  return (
    <header className="sticky top-0 z-30 flex h-top-bar shrink-0 items-center gap-1.5 border-b border-border/70 bg-background/75 px-3 shadow-[0_8px_30px_-18px_hsl(var(--primary)/0.35)] backdrop-blur-xl sm:gap-3 sm:px-6">
      {onToggleSidebar ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden shrink-0 transition-all duration-300 hover:border-primary/40 hover:text-primary lg:inline-flex"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen aria-hidden />
          ) : (
            <PanelLeftClose aria-hidden />
          )}
        </Button>
      ) : null}
      <MobileNav />
      <Breadcrumb />
      <div className="ml-auto hidden min-w-0 flex-1 max-w-md items-center px-2 md:flex">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5 md:ml-0">
        <StreakPill />
        <FavoritesButton />
        <NotificationsMenu />
        <span className="hidden sm:block">
          <HelpMenu />
        </span>
        <span className="hidden md:block">
          <ThemeToggle />
        </span>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden />
        <UserMenu />
      </div>
    </header>
  );
}
