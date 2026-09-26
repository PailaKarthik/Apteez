import { PageContainer } from './page-container';
import { Sidebar } from './sidebar';
import { SiteFooter } from './footer';
import { Topbar } from './topbar';
import { MobileTabBar } from './mobile-tab-bar';
import { EmailVerificationBanner } from '@/components/auth/email-verification-banner';

/**
 * Persistent application shell — the only layout in the product.
 *
 * Desktop (lg+): labeled sidebar + top bar + content + footer.
 * Tablet (md):   same structure with reduced gutters.
 * Mobile (<md):  compact top bar, sheet drawer for full navigation, and a
 *                bottom tab bar with the seven primary sections.
 */
export function AppShell({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar className="hidden lg:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <EmailVerificationBanner />
        <main id="main-content" className="flex flex-1 flex-col">
          <PageContainer>{children}</PageContainer>
        </main>
        <SiteFooter />
        {/* Bottom spacer keeps content clear of the fixed mobile tab bar. */}
        <div className="h-16 md:hidden" aria-hidden />
      </div>
      <MobileTabBar className="md:hidden" />
    </div>
  );
}
