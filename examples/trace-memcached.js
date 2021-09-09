#!/usr/bin/env node --unhandled-rejections=strict

// A small example showing Elastic APM tracing of a script using `memcached`.

const apm = require('../').start({ // elastic-apm-node
  captureExceptions: false,
  logUncaughtExceptions: true,
  captureSpanStackTraces: false,
  stackTraceLimit: 3,
  metricsInterval: 0,
  cloudProvider: 'none',
  centralConfig: false,
  // ^^ Boilerplate config above this line is to focus on just tracing.
  serviceName: 'example-trace-memcached'
})

const assert = require('assert')
const Memcached = require('memcached')

const HOST = process.env.MEMCACHED_HOST || '127.0.0.1'
const PORT = 11211
const client = new Memcached(`${HOST}:${PORT}`, { timeout: 500 })

const t0 = apm.startTransaction('t0')
client.version(function (err, data) {
  console.log('Version: %s (err=%s)', data.version, err)
  assert(apm.currentTransaction === t0)

  client.set('foo', 'bar', 10, function (err) {
    console.log('Set: foo (err=%s)', err)
    assert(apm.currentTransaction === t0)

    client.get('foo', function (err, data) {
      console.log('Get foo: %s (err=%s)', data, err)
      assert(apm.currentTransaction === t0)

      client.get('foo', function (err, data) {
        console.log('Get foo (again): %s (err=%s)', data, err)
        assert(apm.currentTransaction === t0)

        apm.endTransaction()
        client.end()
      })
    })
  })
})
