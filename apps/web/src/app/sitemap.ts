import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/metadata';

/**
 * Indexable public routes with honest priorities. Dynamic detail pages
 * (problem/contest/event IDs, usernames) are intentionally absent — they are
 * client-rendered behind data and auth walls; section pages carry the SEO
 * weight until per-entity SSR metadata lands.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const routes: Array<{ path: string; changeFrequency: 'daily' | 'weekly' | 'monthly'; priority: number }> = [
    { path: '/', changeFrequency: 'daily', priority: 1 },
    { path: '/contests', changeFrequency: 'daily', priority: 0.9 },
    { path: '/challenge', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/learn', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/leaderboard', changeFrequency: 'daily', priority: 0.8 },
    { path: '/events', changeFrequency: 'daily', priority: 0.8 },
    { path: '/discussions', changeFrequency: 'daily', priority: 0.7 },
    { path: '/explore', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/search', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/rewards', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/contribute', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/login', changeFrequency: 'monthly', priority: 0.3 },
    { path: '/register', changeFrequency: 'monthly', priority: 0.3 },
  ];
  return routes.map((route) => ({
    url: `${base}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
