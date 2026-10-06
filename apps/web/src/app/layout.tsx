import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, Outfit } from 'next/font/google';
import { BRAND } from '@apteez/config';
import { AppShell } from '@/components/layout/app-shell';
import { Providers } from '@/components/providers';
import { siteUrl } from '@/lib/metadata';
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

const base = siteUrl();

export const metadata: Metadata = {
  // Note: no `template` object here on purpose — ancestor templates apply
  // inconsistently across nesting depths, so every page sets its full title
  // through `pageMetadata()` instead. This string covers routes without titles.
  title: `${BRAND.name} — Competitive Aptitude Ecosystem`,
  description: BRAND.description,
  applicationName: BRAND.name,
  // Absolute base: OG/canonical URLs resolve against the deployed origin.
  metadataBase: new URL(base),
  authors: [{ name: BRAND.name }],
  creator: BRAND.name,
  keywords: [
    'aptitude',
    'aptitude test',
    'competitive exams',
    'quantitative aptitude',
    'logical reasoning',
    'verbal ability',
    'practice problems',
    'mock contests',
  ],
  openGraph: {
    title: `${BRAND.name} — Competitive Aptitude Ecosystem`,
    description: BRAND.description,
    url: base,
    siteName: BRAND.name,
    type: 'website',
    images: [{ url: `${base}/og.png`, width: 1200, height: 630, alt: `${BRAND.name} — ${BRAND.tagline}` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — Competitive Aptitude Ecosystem`,
    description: BRAND.description,
    images: [`${base}/og.png`],
  },
  robots: { index: true, follow: true },
  icons: { icon: '/logo.svg', apple: '/apple-icon.svg' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1117' },
  ],
};

/** Organization + WebSite structured data for rich search results. */
function JsonLd(): React.JSX.Element {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        name: BRAND.name,
        url: base,
        logo: `${base}/logo.svg`,
        description: BRAND.description,
      },
      {
        '@type': 'WebSite',
        name: BRAND.name,
        url: base,
        description: BRAND.tagline,
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} ${jetbrainsMono.variable} font-sans`}>
        <JsonLd />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
