import type { Metadata } from 'next';
import { BRAND } from '@apteez/config';

/**
 * Canonical site URL for absolute SEO surfaces (sitemap, robots, OG).
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://apteez.vercel.app);
 * local builds fall back to localhost so `next build` never crashes on a
 * missing env var.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_URL ?? 'http://localhost:3000';
  return raw.replace(/\/$/, '');
}

const DEFAULT_KEYWORDS = [
  'aptitude',
  'aptitude test',
  'competitive exams',
  'quantitative aptitude',
  'logical reasoning',
  'verbal ability',
  'practice problems',
  'mock contests',
  'ApteeZ',
];

/**
 * Page-level metadata with the brand suffix baked in.
 *
 * Ancestor `title.template` values apply inconsistently across nesting
 * depths (the root template fires for `/challenge` but not for `/`), so
 * titles stay explicit through this helper instead of relying on template
 * inheritance. The root layout keeps a `default` title as a fallback.
 *
 * Pass `noIndex: true` for auth-walled app surfaces (runners, wizards) —
 * crawlers only ever see their login wall.
 */
export function pageMetadata(
  title: string,
  description: string,
  opts: { noIndex?: boolean; keywords?: string[] } = {},
): Metadata {
  return {
    title: `${title} · ${BRAND.name}`,
    description,
    keywords: [...DEFAULT_KEYWORDS, ...(opts.keywords ?? [])],
    openGraph: {
      title: `${title} · ${BRAND.name}`,
      description,
      type: 'website',
      siteName: BRAND.name,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} · ${BRAND.name}`,
      description,
    },
    ...(opts.noIndex
      ? { robots: { index: false, follow: false } }
      : { robots: { index: true, follow: true } }),
  };
}
