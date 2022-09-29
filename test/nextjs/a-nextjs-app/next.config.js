/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async redirects () {
    return [
      {
        source: '/a-page-redirect',
        destination: '/a-page',
        permanent: false
      }
    ]
  },
  async rewrites () {
    return [
      {
        source: '/a-page-rewrite',
        destination: '/a-page'
      }
    ]
  }
}

module.exports = nextConfig
