import { createRequire } from 'module'
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js'

const require = createRequire(import.meta.url)
const pkg = require('./package.json')
const isWindows = process.platform === 'win32'
const forceStandalone = process.env.NEXT_FORCE_STANDALONE === '1'

/** @type {import('next').NextConfig} */
const baseConfig = {
  // Keep standalone for Linux/Docker, but avoid Windows symlink issues during local builds.
  output: forceStandalone || !isWindows ? 'standalone' : undefined,
  serverExternalPackages: ['imapflow', '@zone-eu/mailsplit', 'iconv-lite', 'libmime', 'mailparser', 'nodemailer', 'socks', 'smart-buffer'],
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'localhost' },
      { protocol: 'http', hostname: '192.168.0.60' },
      { protocol: 'https', hostname: '192.168.0.60' },
    ],
    unoptimized: process.env.NODE_ENV === 'development', // Speed up dev
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_APP_VERSION_LABEL: pkg.appVersionLabel ?? `V${pkg.version}`,
  },
  async redirects() {
    return [
      {
        source: '/finance/service-items',
        destination: '/finance/tour-items',
        permanent: true,
      },
      {
        source: '/finance/service-items/:path*',
        destination: '/finance/tour-items/:path*',
        permanent: true,
      },
    ]
  },
};

export default function nextConfig(phase) {
  return {
    ...baseConfig,
    // Keep dev/build outputs separated so `next build` doesn't corrupt a running dev server on Windows.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  }
}
