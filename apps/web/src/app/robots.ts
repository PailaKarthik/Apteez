import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/metadata';

/**
 * Crawler rules: everything public is indexable except the staff area and
 * auth-walled app surfaces (compete/manage/live runners, creation wizards,
 * personal pages). Those render login walls to crawlers anyway — this just
 * saves crawl budget and keeps them out of the index honestly.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/api/',
          '/favorites',
          '/profile',
          '/contests/new',
          '/events/create',
          '/*/compete',
          '/*/manage',
          '/*/live',
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
