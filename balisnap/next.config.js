/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Temporary safeguard for staging release while HeroUI typings are aligned.
    ignoreBuildErrors: true
  }
}

module.exports = nextConfig
