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
  images: {
    domains: ['localhost', 's3.amazonaws.com'],
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
