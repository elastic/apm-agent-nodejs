/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/redirect-to-a-page',
        destination: '/a-page',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/rewrite-with-a-has-condition',
          destination: '/a-page',
          has: [{ type: 'query', key: 'overrideMe' }],
        },
      ],
      afterFiles: [
        {
          source: '/rewrite-to-a-page',
          destination: '/a-page',
        },
        {
          source: '/rewrite-to-a-dynamic-page/:num',
          destination: '/a-dynamic-page/:num',
        },
        {
          source: '/rewrite-to-a-public-file',
          destination: '/favicon.ico',
        },
        {
          source: '/rewrite-to-a-404',
          destination: '/no-such-page',
        },
      ],
      fallback: [
        {
          source: '/rewrite-external/:path*',
          destination: 'https://old.example.com/:path*',
        },
      ],
    };
  },
};

module.exports = nextConfig;
