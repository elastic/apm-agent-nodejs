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
    return {
      beforeFiles: [
        {
          source: '/rewrite-with-a-has-condition',
          destination: '/a-page',
          has: [{ type: 'query', key: 'overrideMe' }],
        }
      ],
      afterFiles: [
        {
          source: '/rewrite-to-a-page',
          destination: '/a-page'
        },
        {
          // XXX improve this to have dynamic value in params
          source: '/rewrite-to-a-dynamic-page',
          destination: '/a-dynamic-page/3.14'
        },
        {
          source: '/rewrite-to-a-public-file',
          destination: '/favicon.ico'
        },
        {
          source: '/rewrite-to-a-404',
          destination: '/no-such-page'
        }
      ],
      fallback: [
        // These rewrites are checked after both pages/public files
        // and dynamic routes are checked
        {
          source: '/rewrite-external/:path*',
          destination: `https://old.example.com/:path*`,
        },
      ],
    }
  }
}

module.exports = nextConfig
