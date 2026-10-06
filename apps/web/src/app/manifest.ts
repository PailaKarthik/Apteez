import type { MetadataRoute } from 'next';
import { BRAND } from '@apteez/config';

/** PWA manifest: installable name, dummy logo icons, brand theme color. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} — Competitive Aptitude Ecosystem`,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1117',
    // Restrained brand violet (see globals.css --primary).
    theme_color: '#6d3df5',
    icons: [
      { src: '/logo.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
}
