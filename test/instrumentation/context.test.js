/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

var test = require('tape')
var { getHTTPDestination, getDBDestination } = require('../../lib/instrumentation/context')

test('#getHTTPDestination', function (t) {
  t.test('username and pass', (t) => {
    const url = 'http://user:pass@testing.local:1234/path?query'
    t.deepEqual(getHTTPDestination(url, 'external'), {
      service: {
        name: 'http://testing.local:1234',
        resource: 'testing.local:1234',
        type: 'external'
      },
      address: 'testing.local',
      port: 1234
    })
    t.end()
  })

  t.test('https with custom port', () => {
    const url = 'https://example.com:2222'
    t.deepEqual(getHTTPDestination(url, 'external'), {
      service:
      {
        name: 'https://example.com:2222',
        resource: 'example.com:2222',
        type: 'external'
      },
      address: 'example.com',
      port: 2222
    })
    t.end()
  })

  t.test('https default port', (t) => {
    const url = 'https://www.elastic.co/products/apm'
    t.deepEqual(getHTTPDestination(url, 'external'), {
      service: {
        name: 'https://www.elastic.co',
        resource: 'www.elastic.co:443',
        type: 'external'
      },
      address: 'www.elastic.co',
      port: 443
    })
    t.end()
  })

  t.test('http default port', (t) => {
    const url = 'http://www.elastic.co/products/apm'
    t.deepEqual(getHTTPDestination(url, 'external'), {
      service: {
        name: 'http://www.elastic.co',
        resource: 'www.elastic.co:80',
        type: 'external'
      },
      address: 'www.elastic.co',
      port: 80
    })
    t.end()
  })

  t.test('ipv6', (t) => {
    const url = 'http://[::1]'
    t.deepEqual(getHTTPDestination(url, 'external'), {
      service: {
        name: 'http://[::1]',
        resource: '[::1]:80',
        type: 'external'
      },
      address: '::1',
      port: 80
    })
    t.end()
  })

  t.test('ipv6 https custom port', (t) => {
    const url = 'https://[::1]:80/'
    t.deepEqual(getHTTPDestination(url, 'external'), {
      service: {
        name: 'https://[::1]:80',
        resource: '[::1]:80',
        type: 'external'
      },
      address: '::1',
      port: 80
    })
    t.end()
  })
})

test('#getDBDestination', function (t) {
  const span = { type: 'db', subtype: 'memcached' }
  const host = 'localhost'
  const port = '8080'
  const service = {
    name: span.subtype,
    resource: span.subtype,
    type: span.type
  }

  t.test('service fields', (t) => {
    t.deepEqual(getDBDestination(span), { service })
    t.end()
  })

  t.test('host when present', (t) => {
    t.deepEqual(getDBDestination(span, host), {
      service,
      address: host
    })
    t.end()
  })

  t.test('port when present', (t) => {
    t.deepEqual(getDBDestination(span, null, port), {
      service,
      port: 8080
    })
    t.end()
  })
})
