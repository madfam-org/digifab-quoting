/** @type {import('next').NextConfig} */

const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@cotiza/shared', '@cotiza/ui'],
  i18n: {
    defaultLocale: 'es',
    locales: ['es', 'en', 'pt-BR'],
    localeDetection: false,
  },
  // GHSA-2xp9-vwfh-vxw4 defence in depth: nothing in this app imports
  // next/image, so Next's built-in optimizer is off and /_next/image answers
  // 404. The allow-list is exact and empty (the hostname-only `domains` list it
  // replaces is deprecated and allowed any path on s3.amazonaws.com), so
  // re-enabling optimization later cannot turn the app into an image proxy.
  // Guarded by test/next-config.test.mjs (CI: Unit Tests).
  images: {
    unoptimized: true,
    remotePatterns: [],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path((?!auth).*)',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1'}/:path*`,
      },
      {
        source: '/locales/:locale/:namespace',
        destination: '/locales/:locale/:namespace.json',
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
