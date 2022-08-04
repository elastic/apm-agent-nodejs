/*
 * Copyright Elasticsearch B.V. and other contributors where applicable.
 * Licensed under the BSD 2-Clause License; you may not use this file except in
 * compliance with the BSD 2-Clause License.
 */

'use strict'

// Test node v18's `fetch` implementation. This is based on undici.

if (!global.fetch) {
  console.log('# SKIP there is no fetch()')
  process.exit()
}
/* global fetch */ // for eslint

process.env.ELASTIC_APM_TEST = true
const { CapturingTransport } = require('../../../_capturing_transport')
const apm = require('../../../..').start({
  serviceName: 'test-fetch',
  captureExceptions: false,
  metricsInterval: 0,
  centralConfig: false,
  apmServerVersion: '8.0.0',
  spanCompressionEnabled: false,
  transport () { return new CapturingTransport() }
})

const http = require('http')
const { Writable } = require('stream')
const { promisify } = require('util')
const test = require('tape')
const undici = require('undici')

const promisyApmFlush = promisify(apm.flush.bind(apm))
let server
let origin
let lastServerReq

// ---- support functions

// Undici docs (https://github.com/nodejs/undici#garbage-collection) suggest
// that an undici response body should always be consumed.
async function consumeResponseBody (body) {
  return new Promise(resolve => {
    const devNull = new Writable({
      write (_chunk, _encoding, cb) {
        setImmediate(cb)
      }
    })
    body.pipe(devNull)
    body.on('end', resolve)
  })
}

function assertUndiciSpan (t, span, url, reqFailed) {
  const u = new URL(url)
  t.equal(span.name, `GET ${u.host}`, 'span.name')
  t.equal(span.type, 'external', 'span.type')
  t.equal(span.subtype, 'http', 'span.subtype')
  t.equal(span.action, 'GET', 'span.action')
  t.equal(span.outcome, reqFailed ? 'failure' : 'success', 'span.outcome')
  t.equal(span.context.http.method, 'GET', 'span.context.http.method')
  t.equal(span.context.http.url, url, 'span.context.http.url')
  if (!reqFailed) {
    t.equal(span.context.http.status_code, 200, 'span.context.http.status_code')
    t.equal(span.context.http.response.encoded_body_size, 4, 'span.context.http.response.encoded_body_size')
  }
  t.equal(span.context.destination.service.name, '', 'span.context.destination.service.name')
  t.equal(span.context.destination.service.type, '', 'span.context.destination.service.type')
  t.equal(span.context.destination.service.resource, u.host, 'span.context.destination.service.resource')
  t.equal(span.context.destination.address, u.hostname, 'span.context.destination.address')
  t.equal(span.context.destination.port, Number(u.port), 'span.context.destination.port')
}

// ---- tests

test('setup', t => {
  server = http.createServer((req, res) => {
    lastServerReq = req
    req.resume()
    req.on('end', () => {
      setTimeout(() => {
        res.end('pong')
      }, 10)
    })
  })
  server.listen(() => {
    origin = `http://localhost:${server.address().port}`
    t.end()
  })
})

test('fetch', async t => {
  apm._transport.clear()
  const aTrans = apm.startTransaction('aTransName')

  const url = origin + '/ping'
  const res = await undici.fetch(url)
  t.equal(res.status, 200, 'res.status')
  const text = await res.text()
  t.equal(text, 'pong', 'response body')

  aTrans.end()
  t.error(await promisyApmFlush(), 'no apm.flush() error')

  t.equal(apm._transport.spans.length, 1)
  const span = apm._transport.spans[0]
  assertUndiciSpan(t, span, url)

  // Test trace-context propagation.
  t.equal(lastServerReq.headers.traceparent,
    `00-${span.trace_id}-${span.id}-01`,
    'serverReq.headers.traceparent')
  t.equal(lastServerReq.headers.tracestate, 'es=s:1', 'serverReq.headers.tracestate')

  t.end()
})

test('teardown', t => {
  undici.getGlobalDispatcher().close() // Close kept-alive sockets.
  server.close()
  t.end()
})
