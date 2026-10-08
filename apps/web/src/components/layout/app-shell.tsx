'use client';

import * as React from 'react';
import { PageContainer } from './page-container';
import { Sidebar } from './sidebar';
import { SiteFooter } from './footer';
import { Topbar } from './topbar';
import { MobileTabBar } from './mobile-tab-bar';
import { EmailVerificationBanner } from '@/components/auth/email-verification-banner';
import { OnboardingTour } from '@/components/shared/onboarding-tour';

const SIDEBAR_KEY = 'apteez:sidebar-collapsed';

/**
 * Persistent application shell — the only layout in the product.
 *
 * Desktop (lg+): labeled sidebar (collapsible to an icon rail via the
 * top-bar menu button, preference remembered on this device) + top bar +
 * content + footer.
 * Tablet (md):   same structure with reduced gutters.
 * Mobile (<md):  compact top bar, sheet drawer for full navigation, and a
 *                bottom tab bar with the seven primary sections.
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [collapsed, setCollapsed] = React.useState(false);

  // Restore the remembered rail preference after mount (localStorage is
  // unavailable during SSR — default to the full sidebar to avoid a flash
  // of the wrong layout).
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(SIDEBAR_KEY) === '1') {
        setCollapsed(true);
      }
    } catch {
      // Private mode etc. — the toggle still works for the session.
    }
  }, []);

  const toggle = React.useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        // Ignore persistence failures; the session toggle still applies.
      }
      return next;
    });
  }, []);

  return (
    <div className="relative flex min-h-screen bg-background">
      {/* Ambient page glow — fixed, non-interactive, theme-aware. */}
      <div className="pointer-events-none fixed inset-0 -z-0" aria-hidden>
        <span className="aurora-orb left-[-8rem] top-[-8rem] size-[28rem] bg-primary/[0.07]" />
        <span className="aurora-orb right-[-10rem] top-[30%] size-[26rem] bg-primary/[0.05] [animation-delay:-6s]" />
      </div>
      <Sidebar className="hidden lg:flex" collapsed={collapsed} />
      <div className="relative z-0 flex min-w-0 flex-1 flex-col">
        <Topbar sidebarCollapsed={collapsed} onToggleSidebar={toggle} />
        <EmailVerificationBanner />
        <main id="main-content" className="flex flex-1 animate-fade-in flex-col">
          <PageContainer>{children}</PageContainer>
        </main>
        {/* Footer lives on small screens only — desktop keeps the full
            height for content now that the sidebar carries brand + nav. */}
        <div className="lg:hidden">
          <SiteFooter />
        </div>
        {/* Bottom spacer keeps content clear of the fixed mobile tab bar.
            Breakpoint matches the tab bar itself (lg) so tablets never lose
            navigation: sidebar ≥lg, tab bar <lg, drawer always available. */}
        <div className="h-16 lg:hidden" aria-hidden />
      </div>
      <MobileTabBar className="lg:hidden" />
      <OnboardingTour />
    </div>
  );
}
