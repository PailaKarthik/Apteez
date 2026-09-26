import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  transpilePackages: ['@apteez/ui'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'sonner', '@tanstack/react-query'],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // NOTE: `output: 'standalone'` was evaluated for the Docker image but
  // reverted — its traced-file symlinks cannot be created on Windows dev
  // machines (EPERM without Developer Mode). The image instead ships the
  // regular build with production dependencies only and runs `next start`.
};

// Sentry build integration is strictly opt-in: without a DSN the config is
// returned untouched, so local builds never upload sourcemaps or phone home.
// (withSentryConfig is only *called* when a DSN is set; the static import
// above has no build side effects on its own.)
const hasSentryDsn = Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN);

const config = hasSentryDsn
  ? withSentryConfig(nextConfig, {
      silent: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;

export default config;
