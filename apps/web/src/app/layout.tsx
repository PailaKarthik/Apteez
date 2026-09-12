import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import { BRAND } from '@apteez/config';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import './globals.css';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-metric',
  display: 'swap',
});

export const metadata: Metadata = {
  // Note: no `template` object here on purpose — ancestor templates apply
  // inconsistently across nesting depths, so every page sets its full title
  // through `pageMetadata()` instead. This string covers routes without titles.
  title: `${BRAND.name} — Competitive Aptitude Ecosystem`,
  description: BRAND.description,
  applicationName: BRAND.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1117' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} ${jetbrainsMono.variable} font-sans`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
