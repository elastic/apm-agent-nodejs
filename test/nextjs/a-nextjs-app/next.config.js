/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/a-page-redirect',
        destination: '/a-page',
        permanent: false,
      },
    ]
  },
  async rewrites() {
    return [
      {
        source: '/a-page-rewrite',
        destination: '/a-page',
      },
    ]
  },
}

module.exports = nextConfig
